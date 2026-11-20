import { useEffect, useMemo, useState, type FormEvent } from "react";
import { canPublishCargo, filterCargos, normalizeCargoDraft, TRUCK_TYPES, validateCargoDraft, type Cargo, type CargoDraft, type ProfileRole } from "@barkoul/domain";
import { getCurrentProfileRole, getSupabase, listOpenCargos, publishCargo } from "@barkoul/data";
import AdminRoom from "./AdminRoom";
import Workspace from "./Workspace";

const initialDraft: CargoDraft = {
  title: "", origin_city: "", destination_city: "", goods_type: "",
  weight_text: "", truck_type: "", loading_date: "", offered_price_mad: null, notes: ""
};

const todayLocal = () => {
  const now = new Date();
  return [now.getFullYear(), String(now.getMonth()+1).padStart(2,"0"), String(now.getDate()).padStart(2,"0")].join("-");
};

function BrandTruck() {
  return <svg className="brand-truck" viewBox="0 0 150 82" role="img" aria-label="شاحنة Barkoul">
    <path d="M8 29 95 8 95 60 8 60Z M95 24 122 24 143 43 143 60 95 60Z" fill="none" stroke="currentColor" strokeWidth="5" strokeLinejoin="round"/>
    <path d="M108 31h14l12 13h-26Z" fill="none" stroke="currentColor" strokeWidth="4"/>
    <path d="M8 39 78 22 M8 50 78 34 M8 60 78 46" stroke="currentColor" strokeWidth="4" strokeLinecap="round"/>
    <circle cx="38" cy="65" r="10" fill="#073d91" stroke="currentColor" strokeWidth="5"/><circle cx="112" cy="65" r="10" fill="#073d91" stroke="currentColor" strokeWidth="5"/>
  </svg>;
}

function MoroccoMark() {
  return <svg className="morocco-mark" viewBox="0 0 220 330" role="img" aria-label="خريطة المغرب">
    <path d="M86 8 128 18 146 49 174 54 165 85 191 104 174 133 184 157 157 180 151 214 124 228 117 265 91 280 75 316 48 302 43 268 24 250 40 221 32 193 51 172 43 143 63 116 58 86 78 62Z" fill="#ef1d2d" stroke="white" strokeWidth="7" strokeLinejoin="round"/>
    <path d="m100 104 15 35 37-1-30 22 12 36-34-23-31 23 11-37-30-21 38 1Z" fill="none" stroke="#087c42" strokeWidth="9" strokeLinejoin="round"/>
  </svg>;
}

function FeatureArt({kind}:{kind:"boxes"|"fleet"|"driver"}) {
  if (kind === "boxes") return <svg viewBox="0 0 320 190" role="img" aria-label="طرود وصناديق شحن">
    <ellipse cx="160" cy="170" rx="126" ry="12" fill="#9bbbd2"/>
    <path d="M38 130h244v35H38z" fill="#b77b35"/><path d="M48 130v35m24-35v35m24-35v35m24-35v35m24-35v35m24-35v35m24-35v35m24-35v35m24-35v35m24-35v35" stroke="#e6b66f" strokeWidth="5"/>
    <g stroke="#a96827" strokeWidth="2"><path d="m60 80 48-24 49 24-49 25z" fill="#eebd78"/><path d="M60 80v49l48 24v-48z" fill="#d9984e"/><path d="M108 105v48l49-24V80z" fill="#c9823e"/><path d="m142 66 42-22 45 22-45 23z" fill="#f5cc8e"/><path d="M142 66v43l42 22V89z" fill="#dfa45e"/><path d="M184 89v42l45-22V66z" fill="#c98643"/><path d="m176 105 38-19 40 19-40 20z" fill="#edbd7d"/><path d="M176 105v37l38 19v-36z" fill="#d9984e"/><path d="M214 125v36l40-19v-37z" fill="#c9823e"/></g>
  </svg>;
  if (kind === "fleet") return <svg viewBox="0 0 320 190" role="img" aria-label="شاحنة نقل بضائع">
    <ellipse cx="160" cy="164" rx="132" ry="12" fill="#a9c3d5"/>
    <path d="M24 63h184v81H24z" rx="8" fill="#1457a7"/><path d="M35 73h162v60H35z" fill="#e9f4ff"/><path d="M208 91h49l36 35v18h-85z" fill="#e7353c"/><path d="M223 99h29l25 26h-54z" fill="#bdeaff"/><path d="M18 138h280v12H18z" fill="#173c60"/>
    <circle cx="76" cy="151" r="19" fill="#263746"/><circle cx="76" cy="151" r="8" fill="#cbd8e2"/><circle cx="244" cy="151" r="19" fill="#263746"/><circle cx="244" cy="151" r="8" fill="#cbd8e2"/>
    <path d="M35 82h162M35 97h162M35 112h162" stroke="#b8d5ed" strokeWidth="3"/>
  </svg>;
  return <svg viewBox="0 0 320 190" role="img" aria-label="سائق توصيل">
    <rect x="0" y="0" width="320" height="190" fill="#d8efff"/>
    <circle cx="160" cy="65" r="42" fill="#c9875d"/><path d="M118 62q3-48 45-45 40 3 44 47-21-17-43-17-23 0-46 15" fill="#173d62"/>
    <path d="M91 185q6-78 69-78 66 0 70 78" fill="#1559a4"/><path d="M143 112h34l-17 26z" fill="#fff"/><path d="M152 138h16l12 47h-40z" fill="#0d3d78"/>
    <path d="M205 111q28-8 39 13l-22 19-21-14z" fill="#c9875d"/><path d="m219 121 17 12-9 8-18-12z" fill="#fff"/>
    <circle cx="145" cy="67" r="4" fill="#253746"/><circle cx="175" cy="67" r="4" fill="#253746"/><path d="M148 84q12 12 25 0" fill="none" stroke="#7b3d2c" strokeWidth="4" strokeLinecap="round"/>
  </svg>;
}
function FeatureCard({kind,title,subtitle,href}:{kind:"boxes"|"fleet"|"driver";title:string;subtitle:string;href:string}) {
  return <a className="reference-feature" href={href}>
    <div className={`reference-feature-art art-${kind}`}><FeatureArt kind={kind}/></div>
    <div className="reference-feature-copy"><strong>{title}</strong><span>{subtitle}</span><b aria-hidden="true">›</b></div>
  </a>;
}
function HeroTruckScene() {
  return <svg className="reference-hero-scene" viewBox="0 0 1200 430" preserveAspectRatio="xMidYMid slice" role="img" aria-label="شاحنات تنقل البضائع على طريق مغربي">
    <defs><linearGradient id="heroSky" x2="0" y2="1"><stop stopColor="#63c7ff"/><stop offset="1" stopColor="#e8f7ff"/></linearGradient><linearGradient id="heroRoad" x2="0" y2="1"><stop stopColor="#596b7c"/><stop offset="1" stopColor="#172d45"/></linearGradient></defs>
    <rect width="1200" height="430" fill="url(#heroSky)"/>
    <g fill="#fff" opacity=".8"><ellipse cx="180" cy="82" rx="100" ry="27"/><ellipse cx="235" cy="70" rx="65" ry="34"/><ellipse cx="780" cy="72" rx="120" ry="28"/><ellipse cx="850" cy="58" rx="70" ry="35"/></g>
    <path d="M0 260 170 185 310 255 490 170 680 260 870 185 1040 250 1200 190v110H0z" fill="#9ac7b2"/>
    <path d="M0 288q260-60 480 0t720-5v147H0z" fill="#75a66b"/>
    <path d="M0 318 1200 278v152H0z" fill="url(#heroRoad)"/>
    <path d="M0 365 1200 325" stroke="#fff" strokeWidth="8" strokeDasharray="55 38" opacity=".9"/>
    <g transform="translate(80 170)"><rect x="0" y="36" width="440" height="135" rx="8" fill="#1260ad"/><rect x="18" y="51" width="404" height="103" fill="#edf6ff"/><path d="M440 77h105l78 75v19H440z" fill="#1455a0"/><path d="M468 91h66l57 59H468z" fill="#a8e2ff"/><rect x="445" y="158" width="178" height="18" fill="#e8333d"/><circle cx="112" cy="178" r="35" fill="#1d2d3b"/><circle cx="112" cy="178" r="15" fill="#d7e2eb"/><circle cx="520" cy="178" r="35" fill="#1d2d3b"/><circle cx="520" cy="178" r="15" fill="#d7e2eb"/></g>
    <g transform="translate(700 230) scale(.66)"><rect x="0" y="36" width="300" height="135" rx="8" fill="#e7edf2"/><rect x="18" y="51" width="265" height="103" fill="#f7fbff"/><path d="M300 77h105l78 75v19H300z" fill="#d72c35"/><path d="M328 91h66l57 59H328z" fill="#a8e2ff"/><circle cx="112" cy="178" r="35" fill="#1d2d3b"/><circle cx="112" cy="178" r="15" fill="#d7e2eb"/><circle cx="380" cy="178" r="35" fill="#1d2d3b"/><circle cx="380" cy="178" r="15" fill="#d7e2eb"/></g>
  </svg>;
}

export default function App() {
  useEffect(() => { window.dispatchEvent(new Event("barkoul:app-ready")); }, []);
  const db = getSupabase();
  const [cargos, setCargos] = useState<Cargo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [user, setUser] = useState<{id:string; email?:string} | null>(null);
  const [profileRole, setProfileRole] = useState<ProfileRole | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [roleRequest, setRoleRequest] = useState<{id:number;requested_role:"driver"|"owner";status:"pending"|"approved"|"rejected"} | null>(null);
  const [roleRequestMessage, setRoleRequestMessage] = useState("");
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [authMode, setAuthMode] = useState<"login"|"signup">("login");
  const [authMessage, setAuthMessage] = useState("");
  const [resetMode, setResetMode] = useState(false);
  const [draft, setDraft] = useState<CargoDraft>(initialDraft);
  const [publishMessage, setPublishMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [truck, setTruck] = useState("");
  const [adminRoute, setAdminRoute] = useState(() => window.location.hash === "#admin");

  useEffect(() => {
    const syncRoute = () => setAdminRoute(window.location.hash === "#admin");
    window.addEventListener("hashchange", syncRoute);
    return () => window.removeEventListener("hashchange", syncRoute);
  }, []);

  async function refresh() {
    setLoading(true); setError("");
    try { setCargos(await listOpenCargos()); }
    catch { setError("تعذر تحميل الشحنات حالياً. تحقق من الاتصال ثم حاول مجدداً."); }
    finally { setLoading(false); }
  }

  async function refreshProfileRole() {
    if (!db || !user) return;
    setProfileLoading(true);
    setProfileError("");
    try {
      setProfileRole(await getCurrentProfileRole(user.id));
    } catch {
      setProfileRole(null);
      setProfileError("تعذر التحقق من صلاحيات الحساب. حدّث الصفحة وحاول مجدداً.");
    } finally {
      setProfileLoading(false);
    }
  }

  useEffect(() => {
    if (!db) { setLoading(false); return; }
    let alive = true;
    db.auth.getSession().then(({data, error: sessionError}) => {
      if (!alive) return;
      if (sessionError) {
        setAuthMessage("تعذر التحقق من جلسة الدخول. حاول تحديث الصفحة.");
        return;
      }
      setUser(data.session?.user ? {id:data.session.user.id,email:data.session.user.email} : null);
    }).catch(() => {
      if (alive) setAuthMessage("تعذر الاتصال بخدمة تسجيل الدخول. تحقق من الاتصال ثم أعد المحاولة.");
    });
    const {data:{subscription}} = db.auth.onAuthStateChange((_event, session) => {
      // Clear any previous account's role before rendering the next auth state.
      setProfileRole(null);
      setProfileError("");
      setProfileLoading(Boolean(session?.user));
      setUser(session?.user ? {id:session.user.id,email:session.user.email} : null);
    });
    refresh();
    return () => { alive = false; subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    let active = true;
    if (!db || !user) {
      setProfileRole(null);
      setProfileLoading(false);
      setProfileError("");
      return () => { active = false; };
    }

    setProfileLoading(true);
    setProfileError("");
    getCurrentProfileRole(user.id)
      .then((role) => { if (active) setProfileRole(role); })
      .catch(() => {
        if (active) {
          setProfileRole(null);
          setProfileError("تعذر التحقق من صلاحيات الحساب. حدّث الصفحة وحاول مجدداً.");
        }
      })
      .finally(() => { if (active) setProfileLoading(false); });

    return () => { active = false; };
  }, [db, user?.id]);

  useEffect(() => {
    let active = true;
    if (!db || !user) { setRoleRequest(null); return () => { active = false; }; }
    db.from("profile_role_requests")
      .select("id,requested_role,status")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(
        ({ data }) => { if (active) setRoleRequest(data as typeof roleRequest); },
        () => { if (active) setRoleRequest(null); }
      );
    return () => { active = false; };
  }, [db, user?.id]);

  async function submitRoleRequest(requestedRole:"driver"|"owner") {
    if (!db || !user || profileRole !== "user") return;
    setBusy(true); setRoleRequestMessage("");
    try {
      const { error } = await db.from("profile_role_requests").insert({
        user_id:user.id, requested_role:requestedRole, status:"pending"
      });
      if (error) throw error;
      const { data } = await db.from("profile_role_requests")
        .select("id,requested_role,status").eq("user_id",user.id)
        .order("created_at",{ascending:false}).limit(1).maybeSingle();
      setRoleRequest(data as typeof roleRequest);
      setRoleRequestMessage("تم إرسال طلبك إلى الإدارة للمراجعة.");
    } catch {
      setRoleRequestMessage("يوجد طلب قيد المراجعة أو تعذر إرسال الطلب. حدّث الصفحة للتحقق من حالته.");
    } finally { setBusy(false); }
  }

  const visible = useMemo(() => filterCargos(cargos, origin, destination, truck), [cargos, origin, destination, truck]);

  async function submitAuth(event: FormEvent) {
    event.preventDefault(); if (!db) return;
    setBusy(true); setAuthMessage("");
    try {
      const result = authMode === "login"
        ? await db.auth.signInWithPassword({email:email.trim(),password})
        : await db.auth.signUp({email:email.trim(),password,options:{data:{full_name:fullName.trim()}}});
      if (result.error) throw result.error;
      setPassword("");
      setAuthMessage(authMode === "signup" && !result.data.session
        ? "تم إنشاء الحساب. تحقق من بريدك الإلكتروني إذا طُلب منك ذلك."
        : "تمت العملية بنجاح.");
    } catch { setAuthMessage("تعذر إتمام العملية. تحقق من البيانات والاتصال ثم حاول مجدداً."); }
    finally { setBusy(false); }
  }

  async function sendPasswordReset() {
    if (!db || !email.trim()) { setAuthMessage("أدخل بريدك الإلكتروني أولاً."); return; }
    setBusy(true); setAuthMessage("");
    try {
      const { error } = await db.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin + window.location.pathname });
      if (error) throw error;
      setAuthMessage("إذا كان البريد مسجلاً، فستصلك رسالة لإعادة تعيين كلمة المرور.");
    } catch { setAuthMessage("تعذر إرسال رسالة الاستعادة حالياً. حاول مجدداً لاحقاً."); }
    finally { setBusy(false); }
  }

  async function submitCargo(event: FormEvent) {
    event.preventDefault(); setPublishMessage("");
    if (!user) { setPublishMessage("سجّل الدخول أولاً."); return; }
    if (!canPublishCargo(profileRole)) {
      setPublishMessage("هذا الحساب غير مفعّل لنشر الشحنات. يلزم تفعيل دور صاحب البضاعة من الإدارة.");
      return;
    }
    const normalizedDraft = normalizeCargoDraft(draft);
    const errors = validateCargoDraft(normalizedDraft, todayLocal());
    if (errors.length) { setPublishMessage(errors.join(" ")); return; }
    setBusy(true);
    try {
      await publishCargo(normalizedDraft);
      setDraft(initialDraft); setPublishMessage("تم إرسال الشحنة. سنحدّث القائمة.");
      await refresh();
    } catch { setPublishMessage("تعذر نشر الشحنة حالياً. تحقق من الاتصال والصلاحيات ثم حاول مجدداً."); }
    finally { setBusy(false); }
  }

  if (adminRoute) {
    return <AdminRoom
      user={user}
      profileRole={profileRole}
      profileLoading={profileLoading}
      profileError={profileError}
      onRefreshRole={() => void refreshProfileRole()}
      onSignOut={() => { void db?.auth.signOut(); }}
    />;
  }

  return <div className="app-shell">
    <header className="topbar reference-topbar">
      <a className="brand reference-brand" href="#"><BrandTruck/><span className="brand-word">Barkoul<span>.ma</span></span></a>
      <nav><a className="account-entry" href="#account" aria-label="دخول / حساب جديد">{user ? "حسابي" : "دخول الحساب"} <span aria-hidden="true">👤</span></a>
      <a href="#search">الشحنات</a><a href="#publish">نشر شحنة</a>
      {user && profileRole === "admin" && <a href="#admin">غرفة المدير</a>}
      {user && <button className="button button-outline" onClick={async()=>{await db?.auth.signOut();}}>تسجيل الخروج</button>}</nav>
    </header>
    <main>
      <section className="reference-hero">
        <div className="reference-sky" aria-hidden="true"></div>
        <div className="reference-headline"><h1>ربط الشحنات<br/><span>بسائقي الشاحنات في المغرب</span></h1><i></i></div>
        <div className="reference-landscape">
          <HeroTruckScene/>
          <MoroccoMark/>
        </div>
        <div className="reference-actions">
          <a className="reference-action publish-action" href="#publish"><span>▣</span> أنشر شحنة</a>
          <a className="reference-action search-action" href="#search"><span>⌕</span> أبحث عن شحنة</a>
        </div>
      </section>
      <section className="reference-features" aria-label="خدمات Barkoul">
        <FeatureCard kind="boxes" title="نشر شحنة" subtitle="بخطوات سهلة" href="#publish"/>
        <FeatureCard kind="fleet" title="الشحنات المتاحة" subtitle="في جميع المدن" href="#search"/>
        <FeatureCard kind="driver" title="البحث عن شاحنات" subtitle="بسرعة وأمان" href="#search"/>
      </section>

      {!db && <div className="notice notice-warn">الاتصال بقاعدة البيانات غير مضبوط بعد. أضف متغيرات البيئة في إعدادات البناء قبل اختبار الحسابات والشحنات.</div>}

      <section className="section" id="search"><div className="section-heading"><div><p className="eyebrow">اكتشف الفرص</p><h2>الشحنات المتاحة</h2></div><button className="button button-outline" onClick={refresh} disabled={!db || loading}>تحديث</button></div>
        <div className="filters"><label>من مدينة<input value={origin} onChange={e=>setOrigin(e.target.value)} placeholder="مثلاً الدار البيضاء"/></label><label>إلى مدينة<input value={destination} onChange={e=>setDestination(e.target.value)} placeholder="مثلاً مراكش"/></label><label>نوع الشاحنة<select value={truck} onChange={e=>setTruck(e.target.value)}><option value="">جميع الأنواع</option>{TRUCK_TYPES.map(t=><option key={t}>{t}</option>)}</select></label></div>
        {loading ? <p className="muted">جاري تحميل الشحنات…</p> : error ? <p className="notice notice-warn">{error}</p> : visible.length === 0 ? <p className="empty">لا توجد شحنات مطابقة حالياً.</p> :
          <div className="cargo-grid">{visible.map(c=><article className="cargo-card" key={c.id}><div className="cargo-card-top"><span className="tag">{c.truck_type}</span><span className="muted">{c.loading_date}</span></div><h3>{c.title}</h3><p className="route">{c.origin_city}<span>←</span>{c.destination_city}</p><p className="muted">{c.goods_type} {c.weight_text ? " · "+c.weight_text : ""}</p>{c.offered_price_mad != null && <strong className="price">{c.offered_price_mad} درهم</strong>}</article>)}</div>}
      </section>

      <section className="section split" id="account"><div><p className="eyebrow">حسابك على Barkoul</p><h2>{resetMode ? "استعادة كلمة المرور" : authMode === "login" ? "مرحباً بعودتك" : "أنشئ حسابك"}</h2><p className="muted">يمكنك تصفح الشحنات دون حساب. يلزم تسجيل الدخول لنشر شحنة.</p></div>
        <form className="form-card" onSubmit={resetMode ? (e)=>{e.preventDefault();void sendPasswordReset();} : submitAuth}>{!resetMode && authMode === "signup" && <label>الاسم الكامل<input required maxLength={100} value={fullName} onChange={e=>setFullName(e.target.value)} autoComplete="name"/></label>}<label>البريد الإلكتروني<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email"/></label>{!resetMode && <label>كلمة المرور<input type="password" minLength={6} required value={password} onChange={e=>setPassword(e.target.value)} autoComplete={authMode==="login"?"current-password":"new-password"}/></label>}<button className="button button-primary" disabled={busy || !db}>{busy?"جارٍ التنفيذ…":resetMode?"إرسال رابط الاستعادة":authMode==="login"?"تسجيل الدخول":"إنشاء حساب"}</button>{!resetMode && authMode==="login" && <button type="button" className="text-button" onClick={()=>{setResetMode(true);setAuthMessage("");}}>نسيت كلمة المرور؟</button>}<button type="button" className="text-button" onClick={()=>{if(resetMode){setResetMode(false);}else{setAuthMode(authMode==="login"?"signup":"login");}setAuthMessage("");}}>{resetMode?"العودة إلى الدخول":authMode==="login"?"ليس لديك حساب؟ أنشئ حساباً":"لديك حساب؟ سجل الدخول"}</button>{authMessage && <p className="form-message" role="status">{authMessage}</p>}</form>
      </section>

      <section className="section" id="publish"><div className="section-heading"><div><p className="eyebrow">أضف فرصة نقل</p><h2>نشر شحنة جديدة</h2></div></div>
        {user && profileRole === "user" && <div className="form-card">
          <h3>تفعيل نوع حسابك</h3>
          <p className="muted">اختر دورك لإرسال طلب إلى الإدارة. لا يمكنك نشر الشحنات أو تقديم العروض قبل اعتماد الطلب.</p>
          {roleRequest?.status === "pending" ? <p className="form-message" role="status">طلب {roleRequest.requested_role === "owner" ? "صاحب بضائع" : "سائق"} قيد المراجعة.</p> :
           roleRequest?.status === "approved" ? <p className="form-message" role="status">تم اعتماد طلبك. حدّث الصفحة لتحديث الصلاحيات.</p> :
           <div className="hero-actions">
             <button type="button" className="button button-primary" disabled={busy} onClick={()=>void submitRoleRequest("owner")}>أنا صاحب بضائع</button>
             <button type="button" className="button button-light" disabled={busy} onClick={()=>void submitRoleRequest("driver")}>أنا سائق</button>
           </div>}
          {roleRequestMessage && <p className="form-message" role="status">{roleRequestMessage}</p>}
        </div>}
        <form className="form-card cargo-form" onSubmit={submitCargo}><label>عنوان الشحنة<input required maxLength={120} value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})}/></label><div className="form-grid"><label>مدينة الانطلاق<input required maxLength={100} value={draft.origin_city} onChange={e=>setDraft({...draft,origin_city:e.target.value})}/></label><label>مدينة الوصول<input required maxLength={100} value={draft.destination_city} onChange={e=>setDraft({...draft,destination_city:e.target.value})}/></label><label>نوع البضاعة<input required value={draft.goods_type} onChange={e=>setDraft({...draft,goods_type:e.target.value})} placeholder="خضر، فواكه، مواد بناء…"/></label><label>الوزن<input value={draft.weight_text ?? ""} onChange={e=>setDraft({...draft,weight_text:e.target.value || null})}/></label><label>نوع الشاحنة<select required value={draft.truck_type} onChange={e=>setDraft({...draft,truck_type:e.target.value})}><option value="">اختر النوع</option>{TRUCK_TYPES.map(t=><option key={t}>{t}</option>)}</select></label><label>تاريخ النقل<input type="date" required min={todayLocal()} value={draft.loading_date} onChange={e=>setDraft({...draft,loading_date:e.target.value})}/></label><label>السعر المقترح (درهم)<input type="number" min="0" step="0.01" value={draft.offered_price_mad ?? ""} onChange={e=>setDraft({...draft,offered_price_mad:e.target.value===""?null:Number(e.target.value)})}/></label></div><label>ملاحظات<textarea maxLength={1000} value={draft.notes ?? ""} onChange={e=>setDraft({...draft,notes:e.target.value || null})}/></label><button className="button button-primary" disabled={busy || !user || profileLoading || !canPublishCargo(profileRole)}>{busy?"جارٍ النشر…":"نشر الشحنة"}</button>{user && profileLoading && <p className="form-message" role="status">جارٍ التحقق من صلاحية الحساب…</p>}{user && profileError && <p className="form-message" role="status">{profileError}</p>}{user && !profileLoading && !profileError && !canPublishCargo(profileRole) && <p className="form-message" role="status">حسابك مسجل، لكن لم يُفعّل بعد كصاحب بضاعة. تواصل مع الإدارة لتفعيل صلاحية نشر الشحنات.</p>}{user && !profileLoading && !canPublishCargo(profileRole) && <button type="button" className="text-button" onClick={() => void refreshProfileRole()} disabled={profileLoading}>إعادة التحقق من الصلاحية</button>}{publishMessage && <p className="form-message" role="status">{publishMessage}</p>}</form>
      </section>
      {user && (profileRole === "owner" || profileRole === "driver") && <Workspace userId={user.id} role={profileRole} openCargos={cargos}/>}
    </main>
    <footer className="reference-footer">
      <div className="social-links" aria-label="روابط التواصل">
        <a href="https://wa.me/" aria-label="واتساب">◉</a><a href="https://facebook.com/" aria-label="فيسبوك">f</a><a href="https://instagram.com/" aria-label="إنستغرام">◎</a><a href="https://x.com/" aria-label="X">𝕏</a>
      </div>
      <strong>Barkoul.ma <span>—</span> معاً نحو نقل أسهل وأسرع</strong>
    </footer>
  </div>;
}