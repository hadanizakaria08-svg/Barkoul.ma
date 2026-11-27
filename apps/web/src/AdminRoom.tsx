import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ProfileRole } from "@barkoul/domain";
import { getSupabase } from "@barkoul/data";
import { isAdminSessionCurrent } from "./admin-session";

interface AdminRoomProps {
  user: { id: string; email?: string } | null;
  profileRole: ProfileRole | null;
  profileLoading: boolean;
  profileError: string;
  onRefreshRole: () => void;
  onSignOut: () => void;
}

interface DriverDocument { id:number; driver_id:string; document_type:string; storage_path:string; review_status:"pending"|"verified"|"rejected"; uploaded_at:string; }
interface AuditEntry { id:number; admin_id:string|null; action:string; target_table:string|null; target_id:string|null; created_at:string; }
interface AdminCargo { id:number; title:string; origin_city:string; destination_city:string; status:string; created_at:string; }
interface CommissionCharge {id:number;trip_id:number;payer_id:string;payer_role:"owner"|"driver";amount_mad:number;status:"due"|"paid"|"waived";payment_method:string|null;payment_reference:string|null;created_at:string;}
interface RoleRequest {
  id: number;
  user_id: string;
  requested_role: "driver" | "owner";
  status: "pending" | "approved" | "rejected";
  created_at: string;
}

const SIGNED_DOCUMENT_URL_TTL_MS = 5 * 60 * 1000;
const SIGNED_DOCUMENT_URL_CLEAR_MS = SIGNED_DOCUMENT_URL_TTL_MS - 5000;

export default function AdminRoom({
  user, profileRole, profileLoading, profileError, onRefreshRole, onSignOut
}: AdminRoomProps) {
  const [requests, setRequests] = useState<RoleRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [requestError, setRequestError] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [actionMessage, setActionMessage] = useState("");
  const [documents,setDocuments]=useState<DriverDocument[]>([]);
  const [documentLinks,setDocumentLinks]=useState<Record<number,string>>({});
  const [documentLinkErrors,setDocumentLinkErrors]=useState<Record<number,string>>({});
  const [openingDocumentId,setOpeningDocumentId]=useState<number|null>(null);
  const [audit,setAudit]=useState<AuditEntry[]>([]);
  const [adminCargos,setAdminCargos]=useState<AdminCargo[]>([]);
  const [charges,setCharges]=useState<CommissionCharge[]>([]);
  const [paymentReference,setPaymentReference]=useState("");
  const [adminDataError,setAdminDataError]=useState("");
  const documentLinkTimers = useRef<Record<number, number>>({});
  const adminSessionVersion = useRef(0);
  const activeAdminUserId = useRef<string | null>(null);
  // Update after commit but before paint; stale promises cannot write into a
  // different administrator's state, and abandoned renders cannot mutate refs.
  useLayoutEffect(() => {
    activeAdminUserId.current = user && profileRole === "admin" ? user.id : null;
  }, [user?.id, profileRole]);
  const isCurrentAdminSession = useCallback(
    (sessionVersion: number, expectedAdminUserId: string) =>
      isAdminSessionCurrent(
        sessionVersion,
        adminSessionVersion.current,
        expectedAdminUserId,
        activeAdminUserId.current
      ),
    []
  );
  const homeLink = <a className="button button-light" href="#">العودة إلى المنصة</a>;
  const clearDocumentLinkTimers = useCallback(() => {
    for (const timer of Object.values(documentLinkTimers.current)) window.clearTimeout(timer);
    documentLinkTimers.current = {};
  }, []);

  const loadRequests = useCallback(async () => {
    const db = getSupabase();
    const expectedAdminUserId = activeAdminUserId.current;
    if (!db || !expectedAdminUserId) return;
    const sessionVersion = adminSessionVersion.current;
    setLoadingRequests(true); setRequestError("");
    try {
      const { data, error } = await db.from("profile_role_requests")
        .select("id,user_id,requested_role,status,created_at")
        .eq("status", "pending").order("created_at", { ascending: true });
      if (error) throw error;
      if (isCurrentAdminSession(sessionVersion, expectedAdminUserId)) {
        setRequests((data ?? []) as RoleRequest[]);
      }
    } catch {
      if (isCurrentAdminSession(sessionVersion, expectedAdminUserId)) {
        setRequestError("تعذر تحميل الطلبات. تحقق من الاتصال وصلاحيات قاعدة البيانات.");
      }
    } finally {
      if (isCurrentAdminSession(sessionVersion, expectedAdminUserId)) setLoadingRequests(false);
    }
  }, [isCurrentAdminSession]);

  const loadAdminData = useCallback(async () => {
    const db = getSupabase();
    const expectedAdminUserId = activeAdminUserId.current;
    if (!db || !expectedAdminUserId) return;
    const sessionVersion = adminSessionVersion.current;
    setAdminDataError("");
    try {
      const [docsRes, auditRes, cargoRes, chargesRes] = await Promise.all([
        db.from("driver_documents").select("id,driver_id,document_type,storage_path,review_status,uploaded_at").order("uploaded_at", { ascending: false }).limit(100),
        db.from("admin_audit_log").select("id,admin_id,action,target_table,target_id,created_at").order("created_at", { ascending: false }).limit(50),
        db.from("cargos").select("id,title,origin_city,destination_city,status,created_at").order("created_at", { ascending: false }).limit(100),
        db.from("commission_charges").select("id,trip_id,payer_id,payer_role,amount_mad,status,payment_method,payment_reference,created_at").order("created_at", { ascending: false }).limit(100)
      ]);
      if (docsRes.error || auditRes.error || cargoRes.error || chargesRes.error) {
        throw new Error("Admin data read failed");
      }
      if (!isCurrentAdminSession(sessionVersion, expectedAdminUserId)) return;
      clearDocumentLinkTimers();
      setDocuments((docsRes.data ?? []) as DriverDocument[]);
      setDocumentLinks({});
      setDocumentLinkErrors({});
      setAudit((auditRes.data ?? []) as AuditEntry[]);
      setAdminCargos((cargoRes.data ?? []) as AdminCargo[]);
      setCharges((chargesRes.data ?? []) as CommissionCharge[]);
    } catch {
      if (isCurrentAdminSession(sessionVersion, expectedAdminUserId)) {
        setAdminDataError("تعذر تحميل بيانات الإدارة. تحقق من سياسات القراءة والاتصال.");
      }
    }
  }, [clearDocumentLinkTimers, isCurrentAdminSession]);

  async function createDocumentLink(id: number, path: string) {
    const db = getSupabase();
    const expectedAdminUserId = activeAdminUserId.current;
    if (!db || !expectedAdminUserId) return;
    const sessionVersion = adminSessionVersion.current;
    setOpeningDocumentId(id);
    setDocumentLinkErrors(old => ({ ...old, [id]: "" }));
    try {
      const { data, error } = await db.storage.from("driver-documents").createSignedUrl(path, 300);
      if (error || !data?.signedUrl) throw new Error("Signed URL unavailable");
      if (!isCurrentAdminSession(sessionVersion, expectedAdminUserId)) return;
      const previousTimer = documentLinkTimers.current[id];
      if (previousTimer !== undefined) window.clearTimeout(previousTimer);
      setDocumentLinks(old => ({ ...old, [id]: data.signedUrl }));
      documentLinkTimers.current[id] = window.setTimeout(() => {
        if (!isCurrentAdminSession(sessionVersion, expectedAdminUserId)) return;
        delete documentLinkTimers.current[id];
        setDocumentLinks(old => {
          if (old[id] !== data.signedUrl) return old;
          const next = { ...old };
          delete next[id];
          return next;
        });
        setDocumentLinkErrors(old => ({ ...old, [id]: "انتهت صلاحية الرابط المؤقت. أنشئ رابطاً جديداً." }));
      }, SIGNED_DOCUMENT_URL_CLEAR_MS);
    } catch {
      if (isCurrentAdminSession(sessionVersion, expectedAdminUserId)) {
        setDocumentLinks(old => { const next = { ...old }; delete next[id]; return next; });
        setDocumentLinkErrors(old => ({ ...old, [id]: "تعذر إنشاء رابط مؤقت. تحقق من صلاحية الوثيقة ثم أعد المحاولة." }));
      }
    } finally {
      if (isCurrentAdminSession(sessionVersion, expectedAdminUserId)) setOpeningDocumentId(null);
    }
  }

  async function recordCommission(id: number, method: "cash" | "electronic") {
    const db = getSupabase();
    const expectedAdminUserId = activeAdminUserId.current;
    if (!db || !expectedAdminUserId) return;
    const sessionVersion = adminSessionVersion.current;
    if (!isCurrentAdminSession(sessionVersion, expectedAdminUserId)) return;
    if (method === "electronic" && !paymentReference.trim()) {
      setActionMessage("أدخل مرجع العملية الإلكترونية بعد التحقق منها.");
      return;
    }
    setBusyId(id);
    setActionMessage("");
    try {
      const { data: authData, error: authError } = await db.auth.getUser();
      if (authError || authData.user?.id !== expectedAdminUserId) throw new Error("Admin session changed");
      if (!isCurrentAdminSession(sessionVersion, expectedAdminUserId)) return;
      const { error } = await db.rpc("admin_record_commission_payment", {
        p_charge_id: id,
        p_method: method,
        p_reference: method === "electronic" ? paymentReference.trim() : null
      });
      if (error) throw error;
      if (!isCurrentAdminSession(sessionVersion, expectedAdminUserId)) return;
      setPaymentReference("");
      setActionMessage("تم تسجيل التحصيل بعد التحقق.");
      await loadAdminData();
    } catch {
      if (isCurrentAdminSession(sessionVersion, expectedAdminUserId)) {
        setActionMessage("تعذر تسجيل التحصيل. تحقق من حالة العمولة والمرجع.");
      }
    } finally {
      if (isCurrentAdminSession(sessionVersion, expectedAdminUserId)) setBusyId(null);
    }
  }

  async function reviewDocument(id: number, status: "verified" | "rejected") {
    const db = getSupabase();
    const expectedAdminUserId = activeAdminUserId.current;
    if (!db || !expectedAdminUserId) return;
    const sessionVersion = adminSessionVersion.current;
    setBusyId(id);
    setActionMessage("");
    try {
      const { data: authData, error: authError } = await db.auth.getUser();
      if (authError || authData.user?.id !== expectedAdminUserId) throw new Error("Admin session changed");
      if (!isCurrentAdminSession(sessionVersion, expectedAdminUserId)) return;
      const { error } = await db.rpc("admin_review_driver_document", {
        p_document_id: id,
        p_status: status
      });
      if (error) throw error;
      if (!isCurrentAdminSession(sessionVersion, expectedAdminUserId)) return;
      setActionMessage(status === "verified" ? "تم اعتماد الوثيقة." : "تم رفض الوثيقة.");
      await loadAdminData();
    } catch {
      if (isCurrentAdminSession(sessionVersion, expectedAdminUserId)) {
        setActionMessage("تعذر تحديث حالة الوثيقة.");
      }
    } finally {
      if (isCurrentAdminSession(sessionVersion, expectedAdminUserId)) setBusyId(null);
    }
  }

  useEffect(() => {
    adminSessionVersion.current += 1;
    const sessionVersion = adminSessionVersion.current;
    clearDocumentLinkTimers();
    setDocumentLinks({});
    setDocumentLinkErrors({});
    setOpeningDocumentId(null);
    setBusyId(null);
    setLoadingRequests(false);
    setRequests([]);
    setDocuments([]);
    setAudit([]);
    setAdminCargos([]);
    setCharges([]);
    setPaymentReference("");
    setRequestError("");
    setAdminDataError("");
    setActionMessage("");

    if (user && profileRole === "admin") {
      void loadRequests();
      void loadAdminData();
    } else {
      setLoadingRequests(false);
    }

    return () => {
      if (adminSessionVersion.current === sessionVersion) adminSessionVersion.current += 1;
      clearDocumentLinkTimers();
    };
  }, [user?.id, profileRole, loadRequests, loadAdminData, clearDocumentLinkTimers]);

  async function reviewRequest(id: number, approve: boolean) {
    const db = getSupabase();
    const expectedAdminUserId = activeAdminUserId.current;
    if (!db || !expectedAdminUserId) return;
    const sessionVersion = adminSessionVersion.current;
    setBusyId(id);
    setActionMessage("");
    try {
      const { data: authData, error: authError } = await db.auth.getUser();
      if (authError || authData.user?.id !== expectedAdminUserId) throw new Error("Admin session changed");
      if (!isCurrentAdminSession(sessionVersion, expectedAdminUserId)) return;
      const { error } = await db.rpc("admin_review_role_request", {
        p_request_id: id,
        p_approve: approve
      });
      if (error) throw error;
      if (!isCurrentAdminSession(sessionVersion, expectedAdminUserId)) return;
      setActionMessage(approve ? "تم اعتماد الطلب وتفعيل الدور." : "تم رفض الطلب.");
      await loadRequests();
      await loadAdminData();
    } catch {
      if (isCurrentAdminSession(sessionVersion, expectedAdminUserId)) {
        setActionMessage("تعذر تنفيذ القرار. ربما تمت مراجعة الطلب مسبقاً؛ حدّث القائمة.");
      }
    } finally {
      if (isCurrentAdminSession(sessionVersion, expectedAdminUserId)) setBusyId(null);
    }
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
      <section className="admin-section">
        <div className="section-heading"><div><p className="eyebrow">التحقق من السائقين</p><h2>الوثائق المرفوعة</h2></div>
          <button className="button button-outline" onClick={()=>void loadAdminData()}>تحديث</button></div>
        {adminDataError&&<p className="notice notice-warn" role="alert">{adminDataError}</p>}
        {documents.length===0?<p className="empty">لا توجد وثائق مرفوعة للمراجعة.</p>:
          <div className="admin-grid">{documents.map(d=><article className="admin-card" key={d.id}>
            <h2>{d.document_type}</h2><p>معرّف السائق: <bdi>{d.driver_id}</bdi></p>
            <p>الحالة: {d.review_status==="pending"?"قيد المراجعة":d.review_status==="verified"?"معتمدة":"مرفوضة"}</p>
            <p className="muted">{new Date(d.uploaded_at).toLocaleString("ar-MA")}</p>
            {documentLinks[d.id]
              ? <div className="hero-actions">
                  <a className="button button-light" href={documentLinks[d.id]} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">فتح الوثيقة (رابط صالح لخمس دقائق)</a>
                  <button className="button button-outline" disabled={openingDocumentId!==null} onClick={()=>void createDocumentLink(d.id,d.storage_path)}>تجديد الرابط</button>
                </div>
              : <button className="button button-light" disabled={openingDocumentId!==null} onClick={()=>void createDocumentLink(d.id,d.storage_path)}>{openingDocumentId===d.id?"جارٍ إنشاء الرابط…":"إنشاء رابط مؤقت للوثيقة"}</button>}
            {documentLinkErrors[d.id]&&<p className="notice notice-warn" role="alert">{documentLinkErrors[d.id]}</p>}
            {d.review_status==="pending"&&<div className="hero-actions">
              <button className="button button-primary" disabled={busyId!==null} onClick={()=>void reviewDocument(d.id,"verified")}>اعتماد</button>
              <button className="button button-outline" disabled={busyId!==null} onClick={()=>void reviewDocument(d.id,"rejected")}>رفض</button>
            </div>}
          </article>)}</div>}
      </section>
      <section className="admin-section">
        <div className="section-heading"><div><p className="eyebrow">مراقبة المنصة</p><h2>الشحنات المنشورة</h2></div></div>
        {adminCargos.length===0?<p className="empty">لا توجد شحنات.</p>:<div className="admin-grid">{adminCargos.map(c=><article className="admin-card" key={c.id}>
          <h2>{c.title}</h2><p>{c.origin_city} ← {c.destination_city}</p><p>الحالة: {c.status} · #{c.id}</p>
        </article>)}</div>}
      </section>
      <section className="admin-section">
        <div className="section-heading"><div><p className="eyebrow">العمولات والتحصيل</p><h2>مستحقات النقل</h2></div></div>
        <p className="muted">تُنشأ عمولة 10 دراهم على صاحب البضاعة و20 درهماً على السائق بعد تأكيد التسليم. سجّل التحصيل فقط بعد استلام النقد أو التحقق من الدفع الإلكتروني خارج المنصة.</p>
        {charges.length===0?<p className="empty">لا توجد عمولات مسجلة حالياً.</p>:<div className="admin-grid">{charges.map(ch=><article className="admin-card" key={ch.id}>
          <h2>{Number(ch.amount_mad).toLocaleString("ar-MA")} درهم</h2><p>الرحلة #{ch.trip_id} · {ch.payer_role==="owner"?"صاحب البضاعة":"السائق"}</p>
          <p>الحالة: {ch.status==="due"?"مستحقة":ch.status==="paid"?"تم التحصيل":"معفاة"}</p><p className="muted">الحساب: <bdi>{ch.payer_id}</bdi></p>
          {ch.status==="due"&&<div className="hero-actions"><button className="button button-primary" disabled={busyId!==null} onClick={()=>void recordCommission(ch.id,"cash")}>تسجيل نقدي</button>
            <button className="button button-outline" disabled={busyId!==null} onClick={()=>void recordCommission(ch.id,"electronic")}>تسجيل إلكتروني</button></div>}
        </article>)}</div>}
        <label>مرجع الدفع الإلكتروني<input value={paymentReference} onChange={e=>setPaymentReference(e.target.value)} maxLength={120} placeholder="أدخل المرجع بعد التحقق من التحويل"/></label>
      </section>
      <section className="admin-section">
        <div className="section-heading"><div><p className="eyebrow">الأمان والمساءلة</p><h2>سجل التدقيق</h2></div></div>
        {audit.length===0?<p className="empty">لا توجد أحداث إدارية مسجلة بعد.</p>:<div className="admin-grid">{audit.map(a=><article className="admin-card" key={a.id}>
          <h2>{a.action}</h2><p>{a.target_table??"—"} · {a.target_id??"—"}</p><p className="muted">{new Date(a.created_at).toLocaleString("ar-MA")}</p>
        </article>)}</div>}
      </section>

      <p className="admin-footnote">كل قرارات اعتماد الأدوار تمر عبر قاعدة البيانات وتُسجّل في سجل التدقيق.</p>
    </main>
  </div>;
}
