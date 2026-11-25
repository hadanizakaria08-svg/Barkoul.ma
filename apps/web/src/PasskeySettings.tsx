import { useCallback, useEffect, useState } from "react";
import { getSupabase } from "@barkoul/data";

type PasskeyItem = {
  id: string;
  friendly_name?: string | null;
  created_at?: string | null;
  last_used_at?: string | null;
};

export default function PasskeySettings() {
  const db = getSupabase();
  const [items, setItems] = useState<PasskeyItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const supported = typeof window !== "undefined"
    && window.isSecureContext
    && typeof window.PublicKeyCredential !== "undefined";

  const refresh = useCallback(async () => {
    if (!db) return;
    setBusy(true);
    setMessage("");
    try {
      const { data, error } = await db.auth.passkey.list();
      if (error) throw error;
      setItems((data ?? []) as PasskeyItem[]);
    } catch {
      setMessage("تعذر تحميل مفاتيح المرور. قد تكون الميزة غير مفعلة على خادم المصادقة بعد.");
    } finally {
      setBusy(false);
    }
  }, [db]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function register() {
    if (!db || busy) return;
    if (!supported) {
      setMessage("جهازك أو متصفحك لا يدعم مفاتيح المرور، أو أن الاتصال ليس آمناً. استخدم متصفحاً حديثاً عبر HTTPS.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const { data, error } = await db.auth.registerPasskey();
      if (error) throw error;
      setMessage(data?.id
        ? "تم تسجيل مفتاح المرور بنجاح. يمكنك الآن استعمال البصمة أو التعرف على الوجه أو رمز قفل الجهاز."
        : "اكتمل طلب التسجيل. حدّث قائمة مفاتيح المرور للتأكد من ظهوره.");
      await refresh();
    } catch (error) {
      const code = String((error as { code?: string })?.code ?? "").toLowerCase();
      setMessage(code.includes("passkey_disabled")
        ? "ميزة Passkeys غير مفعلة بعد في إعدادات Supabase."
        : "لم يكتمل التسجيل. تأكد من تأكيد بريدك الإلكتروني ومن إعداد البصمة أو الوجه أو قفل الشاشة في جهازك.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(passkeyId: string) {
    if (!db || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const { error } = await db.auth.passkey.delete({ passkeyId });
      if (error) throw error;
      setMessage("تم حذف مفتاح المرور من هذا الحساب.");
      await refresh();
    } catch {
      setMessage("تعذر حذف مفتاح المرور. حدّث القائمة وحاول مجدداً.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="workspace-block" aria-labelledby="passkey-heading">
      <h3 id="passkey-heading">الدخول بالبصمة أو الوجه</h3>
      <p className="muted">سجّل مفتاح مرور لهذا الجهاز. سيطلب الهاتف بصمة الإصبع أو التعرف على الوجه أو رمز قفل الجهاز حسب ما يدعمه. لا يرسل Barkoul.ma صورة وجهك أو بصمتك إلى الخادم.</p>
      <div className="hero-actions">
        <button type="button" className="button button-primary" onClick={() => void register()} disabled={busy || !db}>
          {busy ? "جارٍ التنفيذ…" : "تفعيل البصمة / الوجه"}
        </button>
        <button type="button" className="button button-outline" onClick={() => void refresh()} disabled={busy || !db}>
          تحديث المفاتيح
        </button>
      </div>
      {!supported && <p className="muted">يلزم متصفح حديث واتصال HTTPS وجهاز يدعم Passkeys.</p>}
      {items.length > 0 && <div className="passkey-list">
        {items.map((item) => (
          <article className="offer-row" key={item.id}>
            <strong>{item.friendly_name || "مفتاح مرور"}</strong>
            {item.created_at && <span>أُضيف: {new Date(item.created_at).toLocaleDateString("ar-MA")}</span>}
            {item.last_used_at && <span>آخر استخدام: {new Date(item.last_used_at).toLocaleDateString("ar-MA")}</span>}
            <button type="button" className="text-button" onClick={() => void remove(item.id)} disabled={busy}>حذف هذا المفتاح</button>
          </article>
        ))}
      </div>}
      {items.length === 0 && !busy && <p className="muted">لا توجد مفاتيح مرور مسجلة لهذا الحساب بعد.</p>}
      {message && <p className="form-message" role="status">{message}</p>}
    </section>
  );
}
