import { useCallback, useEffect, useState } from "react";
import type { ProfileRole } from "@barkoul/domain";
import { getSupabase } from "@barkoul/data";

interface AdminRoomProps {
  user: { id: string; email?: string } | null;
  profileRole: ProfileRole | null;
  profileLoading: boolean;
  profileError: string;
  onRefreshRole: () => void;
  onSignOut: () => void;
}

interface RoleRequest {
  id: number;
  user_id: string;
  requested_role: "driver" | "owner";
  status: "pending" | "approved" | "rejected";
  created_at: string;
}

const sections = [
  { title: "إدارة الحسابات", description: "مراجعة طلبات تفعيل حسابات السائقين وأصحاب البضائع", icon: "👥" },
  { title: "إدارة الشحنات", description: "مراجعة الشحنات وحالات النشر", icon: "🚚" },
  { title: "التحقق من السائقين", description: "مراجعة وثائق السائقين وطلبات التحقق", icon: "🪪" },
  { title: "المفاوضات والرحلات", description: "متابعة العروض والاتفاقات والرحلات", icon: "🧾" },
  { title: "سجل التدقيق", description: "مراجعة الأحداث الإدارية والأمنية", icon: "🛡️" },
  { title: "العمولات والتحصيل", description: "متابعة العمولات بعد اعتماد آلية الدفع", icon: "💳" }
];

export default function AdminRoom({
  user, profileRole, profileLoading, profileError, onRefreshRole, onSignOut
}: AdminRoomProps) {
  const [requests, setRequests] = useState<RoleRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [requestError, setRequestError] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [actionMessage, setActionMessage] = useState("");
  const homeLink = <a className="button button-light" href="#">العودة إلى المنصة</a>;
  const loadRequests = useCallback(async () => {
    const db = getSupabase();
    if (!db) return;
    setLoadingRequests(true); setRequestError("");
    try {
      const { data, error } = await db.from("profile_role_requests")
        .select("id,user_id,requested_role,status,created_at")
        .eq("status", "pending").order("created_at", { ascending: true });
      if (error) throw error;
      setRequests((data ?? []) as RoleRequest[]);
    } catch {
      setRequestError("تعذر تحميل الطلبات. تحقق من الاتصال وصلاحيات قاعدة البيانات.");
    } finally { setLoadingRequests(false); }
  }, []);

  useEffect(() => {
    if (user && profileRole === "admin") void loadRequests();
  }, [user?.id, profileRole, loadRequests]);

  async function reviewRequest(id: number, approve: boolean) {
    const db = getSupabase();
    if (!db || profileRole !== "admin") return;
    setBusyId(id); setActionMessage("");
    try {
      const { error } = await db.rpc("admin_review_role_request", {
        p_request_id: id, p_approve: approve
      });
      if (error) throw error;
      setActionMessage(approve ? "تم اعتماد الطلب وتفعيل الدور." : "تم رفض الطلب.");
      await loadRequests();
    } catch {
      setActionMessage("تعذر تنفيذ القرار. ربما تمت مراجعة الطلب مسبقاً؛ حدّث القائمة.");
    } finally { setBusyId(null); }
  }

  if (!user) {
    return <main className="admin-gate" dir="rtl"><section className="admin-gate-card">
      <div className="admin-lock" aria-hidden="true">🔒</div><p className="eyebrow">منطقة محمية</p>
      <h1>غرفة المدير</h1><p>هذه المنطقة خاصة بحسابات الإدارة المصرّح لها فقط. سجّل الدخول أولاً.</p>
      <div className="admin-gate-actions">{homeLink}<a className="button button-primary" href="./#account">تسجيل الدخول</a></div>
    </section></main>;
  }
  if (profileLoading) {
    return <main className="admin-gate" dir="rtl"><section className="admin-gate-card" aria-live="polite">
      <div className="admin-lock" aria-hidden="true">⏳</div><h1>جارٍ التحقق من صلاحية المدير</h1>
      <p>لن تظهر لوحة الإدارة قبل اكتمال التحقق.</p></section></main>;
  }
  if (profileError) {
    return <main className="admin-gate" dir="rtl"><section className="admin-gate-card" role="alert">
      <div className="admin-lock" aria-hidden="true">⚠️</div><h1>تعذر التحقق من الصلاحية</h1>
      <p>تم إيقاف الوصول إلى غرفة المدير احتياطياً.</p>
      <div className="admin-gate-actions"><button className="button button-primary" onClick={onRefreshRole}>إعادة التحقق</button>{homeLink}</div>
    </section></main>;
  }
  if (profileRole !== "admin") {
    return <main className="admin-gate" dir="rtl"><section className="admin-gate-card" role="alert">
      <div className="admin-lock" aria-hidden="true">⛔</div><p className="eyebrow">وصول مرفوض</p>
      <h1>هذه الغرفة للمدير فقط</h1><p>حسابك لا يحمل صلاحية المدير. لم يتم تحميل أي بيانات إدارية.</p>
      <div className="admin-gate-actions">{homeLink}</div>
    </section></main>;
  }

  return <div className="admin-shell" dir="rtl">
    <header className="admin-topbar"><a className="brand" href="#">Barkoul<span>.ma</span></a>
      <div className="admin-topbar-actions"><span className="admin-session"><span className="admin-session-dot" /> جلسة مدير موثقة</span>
        {homeLink}<button className="button button-outline" onClick={onSignOut}>تسجيل الخروج</button></div>
    </header>
    <main className="admin-main">
      <section className="admin-welcome"><p className="eyebrow">مساحة الإدارة الخاصة</p><h1>غرفة المدير</h1>
        <p>مركز مراقبة Barkoul.ma وإدارة العمليات والصلاحيات.</p></section>
      <section className="admin-section">
        <div className="section-heading"><div><p className="eyebrow">طلبات الحسابات</p><h2>طلبات تفعيل الأدوار</h2></div>
          <button className="button button-outline" onClick={()=>void loadRequests()} disabled={loadingRequests}>تحديث القائمة</button></div>
        {loadingRequests ? <p className="muted">جارٍ تحميل الطلبات…</p> :
          requestError ? <p className="notice notice-warn" role="alert">{requestError}</p> :
          requests.length === 0 ? <p className="empty">لا توجد طلبات معلقة حالياً.</p> :
          <div className="admin-grid">{requests.map((request)=><article className="admin-card" key={request.id}>
            <span className="admin-card-icon" aria-hidden="true">{request.requested_role==="driver"?"🚚":"📦"}</span>
            <h2>{request.requested_role==="driver"?"طلب تفعيل سائق":"طلب تفعيل صاحب بضائع"}</h2>
            <p>معرّف الحساب: <bdi>{request.user_id}</bdi></p>
            <p className="muted">{new Date(request.created_at).toLocaleString("ar-MA")}</p>
            <div className="hero-actions">
              <button className="button button-primary" disabled={busyId!==null} onClick={()=>void reviewRequest(request.id,true)}>{busyId===request.id?"جارٍ التنفيذ…":"اعتماد"}</button>
              <button className="button button-outline" disabled={busyId!==null} onClick={()=>void reviewRequest(request.id,false)}>رفض</button>
            </div>
          </article>)}</div>}
        {actionMessage && <p className="form-message" role="status">{actionMessage}</p>}
      </section>
      <section className="admin-section"><div className="section-heading"><div><p className="eyebrow">أقسام الإدارة</p><h2>مركز التحكم</h2></div></div>
        <div className="admin-grid">{sections.map((section)=><article className="admin-card" key={section.title}>
          <span className="admin-card-icon" aria-hidden="true">{section.icon}</span><h2>{section.title}</h2>
          <p>{section.description}</p><span className="admin-pending">يُستكمل ربط هذا القسم بعد اختبار صلاحياته</span>
        </article>)}</div>
      </section>
      <p className="admin-footnote">كل قرارات اعتماد الأدوار تمر عبر قاعدة البيانات وتُسجّل في سجل التدقيق.</p>
    </main>
  </div>;
}
