import { useCallback, useEffect, useState } from "react";
import { getSupabase } from "@barkoul/data";

type PasskeyItem = {
  id: string;
  friendly_name?: string | null;
  created_at: string;
  last_used_at?: string | null;
};

export default function PasskeySettings() {
  const db = getSupabase();
  const [items, setItems] = useState<PasskeyItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const refresh = useCallback(async () => {
    if (!db) return;
    setBusy(true);
    setMessage("");
    try {
      const { data, error } = await db.auth.passkey.list();
      if (error) throw error;
      setItems((data ?? []) as PasskeyItem[]);
    } catch {
      setMessage("مفاتيح المرور غير مفعلة في إعدادات المصادقة بعد، أو أن المتصفح لا يدعمها. يمكنك متابعة الدخول بكلمة المرور.");
    } finally {
      setBusy(false);
    }
  }, [db]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function register() {
    if (!db) return;
    setBusy(true);
    setMessage("");
    try {
      const { error } = await db.auth.registerPasskey();
      if (error) throw error;
      setMessage("تم تسجيل مفتاح المرور لهذا الحساب. يمكنك استخدام بصمة الإصبع أو وسيلة التحقق التي يوفرها جهازك في المرات القادمة.");
      await refresh();
    } catch {
      setMessage("لم يكتمل تسجيل مفتاح المرور. تأكد من تأكيد بريدك الإلكتروني وتفعيل Passkeys في إعدادات المشروع، ثم حاول مجدداً.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(passkeyId: string) {
    if (!db) return;
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

  return <section className="workspace-block" aria-labelledby="passkey-heading">
    <h3 id="passkey-heading">حماية الدخول بالبصمة ومفاتيح المرور</h3>
    <p className="muted">يمكن لجهازك التحقق منك ببصمة الإصبع أو التعرف على الوجه أو PIN. لا يرسل الموقع صورة بصمتك أو يخزنها؛ التحقق يتم داخل الجهاز أو مدير مفاتيح المرور.</p>
    <div className="hero-actions">
      <button type="button" className="button button-primary" onClick={() => void register()} disabled={busy || !db}>
        {busy ? "جارٍ التنفيذ…" : "تسجيل بصمة / مفتاح مرور"}
      </button>
      <button type="button" className="button button-outline" onClick={() => void refresh()} disabled={busy || !db}>
        تحديث المفاتيح
      </button>
    </div>
    {items.length > 0 && <div className="passkey-list">
      {items.map((item) => <article className="offer-row" key={item.id}>
        <strong>{item.friendly_name || "مفتاح مرور"}</strong>
        <span>أُضيف: {new Date(item.created_at).toLocaleDateString("ar-MA")}</span>
        {item.last_used_at && <span>آخر استخدام: {new Date(item.last_used_at).toLocaleDateString("ar-MA")}</span>}
        <button type="button" className="text-button" onClick={() => void remove(item.id)} disabled={busy}>حذف هذا المفتاح</button>
      </article>)}
    </div>}
    {items.length === 0 && !busy && <p className="muted">لم تسجل مفتاح مرور لهذا الحساب بعد.</p>}
    {message && <p className="form-message" role="status">{message}</p>}
  </section>;
}
