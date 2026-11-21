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
  return null;
}

function MoroccoMark() {
  return <svg className="morocco-mark" viewBox="0 0 220 330" role="img" aria-label="خريطة المغرب">
    <path d="M86 8 128 18 146 49 174 54 165 85 191 104 174 133 184 157 157 180 151 214 124 228 117 265 91 280 75 316 48 302 43 268 24 250 40 221 32 193 51 172 43 143 63 116 58 86 78 62Z" fill="#D62828" stroke="white" strokeWidth="7" strokeLinejoin="round"/>
    <path d="m100 104 15 35 37-1-30 22 12 36-34-23-31 23 11-37-30-21 38 1Z" fill="none" stroke="#087c42" strokeWidth="9" strokeLinejoin="round"/>
  </svg>;
}

function FeatureCard({image,alt,title,subtitle,href,map=false}:{image?:string;alt?:string;title:string;subtitle:string;href:string;map?:boolean}) {
  return <a className={`home-feature-card${map?" home-feature-map-card":""}`} href={href}>
    <div className={`home-feature-visual${map?" home-feature-map":""}`}>
      {image ? <img src={image} alt={alt ?? ""} loading="lazy" decoding="async"/> : <MoroccoMark/>}
    </div>
    <div className="home-feature-copy"><strong>{title}</strong><span>{subtitle}</span><b aria-hidden="true">←</b></div>
  </a>;
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
  const publishRoute = new URLSearchParams(window.location.search).get("page") === "publish";
  const servicesRoute = new URLSearchParams(window.location.search).get("page") === "services";

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

  if (publishRoute) {
    return <div className="app-shell">
      <header className="topbar home-topbar publish-topbar">
        <a className="brand home-brand" href="./" aria-label="Barkoul.ma الصفحة الرئيسية"><BrandTruck/><span className="brand-word">Barkoul<span>.ma</span></span></a>
        <nav aria-label="التنقل">
          <a className="home-nav-link" href="./">الصفحة الرئيسية</a>
          <a className="account-entry" href={user ? "#publish" : "#publish-account"}>{user ? "حسابي" : "دخول الحساب"}</a>
        </nav>
      </header>
      <main className="publish-page">
        <div className="publish-page-heading">
          <p className="eyebrow">Barkoul.ma · نشر الشحنات</p>
          <h1>أنشر شحنتك</h1>
          <p>أدخل تفاصيل الشحنة ليتعرف عليها السائقون ويقدموا لك عروض النقل المناسبة.</p>
        </div>
        {!user ? (
          <section className="section split publish-account" id="publish-account">
            <div><p className="eyebrow">خطوة واحدة قبل النشر</p><h2>{resetMode ? "استعادة كلمة المرور" : authMode === "login" ? "مرحباً بعودتك" : "أنشئ حسابك"}</h2><p className="muted">سجّل الدخول أو أنشئ حساباً جديداً، ثم ستظهر لك استمارة نشر الشحنة هنا مباشرة.</p></div>
            <form className="form-card" onSubmit={resetMode ? (e)=>{e.preventDefault();void sendPasswordReset();} : submitAuth}>
              {!resetMode && authMode === "signup" && <label>الاسم الكامل<input required maxLength={100} value={fullName} onChange={e=>setFullName(e.target.value)} autoComplete="name"/></label>}
              <label>البريد الإلكتروني<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email"/></label>
              {!resetMode && <label>كلمة المرور<input type="password" minLength={6} required value={password} onChange={e=>setPassword(e.target.value)} autoComplete={authMode==="login"?"current-password":"new-password"}/></label>}
              <button className="button button-primary" disabled={busy || !db}>{busy?"جارٍ التنفيذ…":resetMode?"إرسال رابط الاستعادة":authMode==="login"?"تسجيل الدخول":"إنشاء حساب"}</button>
              {!resetMode && authMode==="login" && <button type="button" className="text-button" onClick={()=>{setResetMode(true);setAuthMessage("");}}>نسيت كلمة المرور؟</button>}
              <button type="button" className="text-button" onClick={()=>{if(resetMode){setResetMode(false);}else{setAuthMode(authMode==="login"?"signup":"login");}setAuthMessage("");}}>{resetMode?"العودة إلى الدخول":authMode==="login"?"ليس لديك حساب؟ أنشئ حساباً":"لديك حساب؟ سجل الدخول"}</button>
              {authMessage && <p className="form-message" role="status">{authMessage}</p>}
            </form>
          </section>
        ) : (
          <section className="section publish-form-section" id="publish">
            <div className="section-heading"><div><p className="eyebrow">أضف فرصة نقل</p><h2>تفاصيل الشحنة</h2></div></div>
            {profileRole === "user" && <div className="form-card publish-role-card">
              <h3>تفعيل نوع حسابك</h3>
              <p className="muted">اختر دورك لإرسال طلب إلى الإدارة. لا يمكنك نشر الشحنات قبل اعتماد طلب صاحب البضائع.</p>
              {roleRequest?.status === "pending" ? <p className="form-message" role="status">طلب {roleRequest.requested_role === "owner" ? "صاحب بضائع" : "سائق"} قيد المراجعة.</p> :
               roleRequest?.status === "approved" ? <p className="form-message" role="status">تم اعتماد طلبك. حدّث الصفحة لتحديث الصلاحيات.</p> :
               <div className="hero-actions">
                 <button type="button" className="button button-primary" disabled={busy} onClick={()=>void submitRoleRequest("owner")}>أنا صاحب بضائع</button>
                 <button type="button" className="button button-light" disabled={busy} onClick={()=>void submitRoleRequest("driver")}>أنا سائق</button>
               </div>}
              {roleRequestMessage && <p className="form-message" role="status">{roleRequestMessage}</p>}
            </div>}
            <form className="form-card cargo-form" onSubmit={submitCargo}>
              <label>عنوان الشحنة<input required maxLength={120} value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})}/></label>
              <div className="form-grid">
                <label>مدينة الانطلاق<input required maxLength={100} value={draft.origin_city} onChange={e=>setDraft({...draft,origin_city:e.target.value})}/></label>
                <label>مدينة الوصول<input required maxLength={100} value={draft.destination_city} onChange={e=>setDraft({...draft,destination_city:e.target.value})}/></label>
                <label>نوع البضاعة<input required value={draft.goods_type} onChange={e=>setDraft({...draft,goods_type:e.target.value})} placeholder="خضر، فواكه، مواد بناء…"/></label>
                <label>الوزن<input value={draft.weight_text ?? ""} onChange={e=>setDraft({...draft,weight_text:e.target.value || null})}/></label>
                <label>نوع الشاحنة<select required value={draft.truck_type} onChange={e=>setDraft({...draft,truck_type:e.target.value})}><option value="">اختر النوع</option>{TRUCK_TYPES.map(t=><option key={t}>{t}</option>)}</select></label>
                <label>تاريخ النقل<input type="date" required min={todayLocal()} value={draft.loading_date} onChange={e=>setDraft({...draft,loading_date:e.target.value})}/></label>
                <label>السعر المقترح (درهم)<input type="number" min="0" step="0.01" value={draft.offered_price_mad ?? ""} onChange={e=>setDraft({...draft,offered_price_mad:e.target.value===""?null:Number(e.target.value)})}/></label>
              </div>
              <label>ملاحظات<textarea maxLength={1000} value={draft.notes ?? ""} onChange={e=>setDraft({...draft,notes:e.target.value || null})}/></label>
              <button className="button button-primary" disabled={busy || profileLoading || !canPublishCargo(profileRole)}>{busy?"جارٍ النشر…":"نشر الشحنة"}</button>
              {profileLoading && <p className="form-message" role="status">جارٍ التحقق من صلاحية الحساب…</p>}
              {profileError && <p className="form-message" role="status">{profileError}</p>}
              {!profileLoading && !profileError && !canPublishCargo(profileRole) && <p className="form-message" role="status">حسابك مسجل، لكن لم يُفعّل بعد كصاحب بضاعة. أرسل طلب تفعيل صاحب البضائع أعلاه وانتظر موافقة الإدارة.</p>}
              {!profileLoading && !canPublishCargo(profileRole) && <button type="button" className="text-button" onClick={() => void refreshProfileRole()}>إعادة التحقق من الصلاحية</button>}
              {publishMessage && <p className="form-message" role="status">{publishMessage}</p>}
            </form>
          </section>
        )}
      </main>
      <footer className="reference-footer"><strong>Barkoul.ma <span>—</span> معاً نحو نقل أسهل وأسرع</strong></footer>
    </div>;
  }

  if (!servicesRoute) {
    return <div className="app-shell entry-shell">
      <header className="topbar home-topbar entry-topbar">
        <a className="brand home-brand" href="./" aria-label="Barkoul.ma الصفحة الرئيسية"><BrandTruck/><span className="brand-word">Barkoul<span>.ma</span></span></a>
        <span className="entry-country">منصة النقل المغربية</span>
      </header>
      <main className="entry-main">
        <section className="entry-welcome" aria-labelledby="entry-title">
          <div className="entry-copy">
            <p className="home-kicker">نقل البضائع في جميع أنحاء المغرب</p>
            <h1 id="entry-title">كل شحنة تجد طريقها،<span> وكل سائق يجد فرصته.</span></h1>
            <p>منصة مغربية تجمع أصحاب البضائع والناقلين في مكان واحد، لتسهيل البحث عن الشحنات وتنظيم النقل بين المدن.</p>
            <a className="entry-primary" href="?page=services">الدخول إلى الموقع <span aria-hidden="true">←</span></a>
            <p className="entry-guest-note">يمكنك تصفح الشحنات كزائر دون إنشاء حساب.</p>
          </div>
          <div className="entry-map-panel" aria-label="تغطية خدمات النقل في المغرب">
            <div className="entry-map-glow"></div>
            <MoroccoMark/>
            <strong>من طنجة إلى مدن الجنوب</strong>
            <span>تغطية وطنية · منصة واحدة</span>
          </div>
        </section>
        <section className="entry-account" id="entry-account" aria-labelledby="entry-account-title">
          {user ? (
            <div className="entry-signed-in">
              <div><p className="eyebrow">مرحباً بعودتك</p><h2 id="entry-account-title">أنت مسجل الدخول بالفعل</h2><p className="muted">يمكنك الانتقال مباشرة إلى خدمات Barkoul.ma.</p></div>
              <a className="button button-primary" href="?page=services">متابعة إلى الخدمات</a>
            </div>
          ) : (
            <>
              <div className="entry-account-intro"><p className="eyebrow">حساب Barkoul.ma</p><h2 id="entry-account-title">{resetMode ? "استعادة كلمة المرور" : authMode === "login" ? "تسجيل الدخول" : "إنشاء حساب جديد"}</h2><p className="muted">سجّل الدخول لإدارة شحناتك وعروض النقل، أو تابع كزائر لتصفح الشحنات.</p></div>
              <form className="entry-auth-form" onSubmit={resetMode ? (e)=>{e.preventDefault();void sendPasswordReset();} : submitAuth}>
                {!resetMode && authMode === "signup" && <label>الاسم الكامل<input required maxLength={100} value={fullName} onChange={e=>setFullName(e.target.value)} autoComplete="name"/></label>}
                <label>البريد الإلكتروني<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email"/></label>
                {!resetMode && <label>كلمة المرور<input type="password" minLength={6} required value={password} onChange={e=>setPassword(e.target.value)} autoComplete={authMode==="login"?"current-password":"new-password"}/></label>}
                <button className="button button-primary" disabled={busy || !db}>{busy?"جارٍ التنفيذ…":resetMode?"إرسال رابط الاستعادة":authMode==="login"?"تسجيل الدخول":"إنشاء حساب"}</button>
                {!resetMode && authMode==="login" && <button type="button" className="text-button" onClick={()=>{setResetMode(true);setAuthMessage("");}}>نسيت كلمة المرور؟</button>}
                <button type="button" className="text-button" onClick={()=>{if(resetMode){setResetMode(false);}else{setAuthMode(authMode==="login"?"signup":"login");}setAuthMessage("");}}>{resetMode?"العودة إلى الدخول":authMode==="login"?"ليس لديك حساب؟ أنشئ حساباً":"لديك حساب؟ سجل الدخول"}</button>
                {authMessage && <p className="form-message" role="status">{authMessage}</p>}
              </form>
            </>
          )}
        </section>
      </main>
      <footer className="reference-footer"><strong>Barkoul.ma <span>—</span> معاً نحو نقل أسهل وأسرع</strong></footer>
    </div>;
  }

  return <div className="app-shell">
    <header className="topbar home-topbar services-topbar">
      <a className="brand home-brand" href="./" aria-label="Barkoul.ma الصفحة الرئيسية"><BrandTruck/><span className="brand-word">Barkoul<span>.ma</span></span></a>
      <nav aria-label="التنقل"><a className="home-nav-link" href="./">الصفحة الأولى</a><a className="account-entry" href="?page=publish#publish-account">دخول الحساب / نشر شحنة</a></nav>
    </header>
    <main>
      <section className="home-choice-hero" aria-labelledby="home-title">
        <div className="home-choice-heading">
          <p className="home-kicker">منصة النقل المغربية</p>
          <h1 id="home-title">مرحباً بك في Barkoul.ma</h1>
          <p>اختر ما تريد القيام به</p>
        </div>
        <div className="home-choice-grid">
          <a className="home-choice-card home-choice-publish" href={user ? "?page=publish#publish" : "?page=publish#publish-account"}>
            <img src="https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?auto=format&fit=crop&w=1000&q=85" alt="شاحنة نقل بضائع على الطريق" fetchPriority="high" decoding="async"/>
            <span className="home-choice-overlay"></span>
            <span className="home-choice-label"><strong>إضافة شحنة</strong><small>أريد نقل بضاعتي</small></span>
          </a>
          <a className="home-choice-card home-choice-search" href="#search">
            <img src="https://images.unsplash.com/photo-1570125909232-eb263c188f7e?auto=format&fit=crop&w=1000&q=85" alt="وسيلة نقل تسير على الطريق" fetchPriority="high" decoding="async"/>
            <span className="home-choice-overlay"></span>
            <span className="home-choice-label"><strong>البحث عن شحنة</strong><small>أبحث عن حمولة لنقلها</small></span>
          </a>
        </div>
      </section>
      <section className="home-features" aria-label="خدمات Barkoul">
        <FeatureCard image="https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?auto=format&fit=crop&w=720&q=80" alt="شاحنة نقل بضائع" title="لأصحاب البضائع" subtitle="انشر شحنتك واعثر على ناقل" href={user ? "?page=publish#publish" : "?page=publish#publish-account"}/>
        <FeatureCard image="https://images.unsplash.com/photo-1570125909232-eb263c188f7e?auto=format&fit=crop&w=720&q=80" alt="حافلة تسير على طريق في المغرب" title="للسائقين والناقلين" subtitle="اكتشف فرص النقل والرحلات" href="#search"/>
        <FeatureCard title="تغطية وطنية" subtitle="من طنجة إلى مدن الجنوب" href="#search" map/>
      </section>
      <section className="cargo-categories" aria-label="أنواع الشحنات">
        <div className="category-heading"><p className="eyebrow">كل أنواع النقل</p><h2>ماذا تريد أن تنقل؟</h2></div>
        <div className="category-grid">
          <a href={user ? "?page=publish#publish" : "?page=publish#publish-account"}><img src="https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=600&q=80" alt="خضر وفواكه طازجة" loading="lazy"/><strong>خضر وفواكه</strong></a>
          <a href={user ? "?page=publish#publish" : "?page=publish#publish-account"}><img src="https://images.unsplash.com/photo-1581094794329-c8112a89af12?auto=format&fit=crop&w=600&q=80" alt="مواد البناء" loading="lazy"/><strong>مواد البناء</strong></a>
          <a href={user ? "?page=publish#publish" : "?page=publish#publish-account"}><img src="https://images.unsplash.com/photo-1607082349566-187342175e2f?auto=format&fit=crop&w=600&q=80" alt="طرود وبضائع" loading="lazy"/><strong>بضائع عامة</strong></a>
          <a href={user ? "?page=publish#publish" : "?page=publish#publish-account"}><img src="https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=600&q=80" alt="أثاث وأجهزة منزلية" loading="lazy"/><strong>أثاث وأجهزة</strong></a>
          <a href={user ? "?page=publish#publish" : "?page=publish#publish-account"}><img src="https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?auto=format&fit=crop&w=600&q=80" alt="مواد غذائية" loading="lazy"/><strong>مواد غذائية</strong></a>
          <a href={user ? "?page=publish#publish" : "?page=publish#publish-account"}><img src="https://images.unsplash.com/photo-1519003722824-194d4455a60c?auto=format&fit=crop&w=600&q=80" alt="شاحنة نقل مبرد" loading="lazy"/><strong>شاحنة تبريد</strong></a>
        </div>
      </section>

      {!db && <div className="notice notice-warn">الاتصال بقاعدة البيانات غير مضبوط بعد. أضف متغيرات البيئة في إعدادات البناء قبل اختبار الحسابات والشحنات.</div>}

      <section className="section" id="search"><div className="section-heading"><div><p className="eyebrow">اكتشف الفرص</p><h2>الشحنات المتاحة</h2></div><button className="button button-outline" onClick={refresh} disabled={!db || loading}>تحديث</button></div>
        <div className="filters"><label>من مدينة<input value={origin} onChange={e=>setOrigin(e.target.value)} placeholder="مثلاً الدار البيضاء"/></label><label>إلى مدينة<input value={destination} onChange={e=>setDestination(e.target.value)} placeholder="مثلاً مراكش"/></label><label>نوع الشاحنة<select value={truck} onChange={e=>setTruck(e.target.value)}><option value="">جميع الأنواع</option>{TRUCK_TYPES.map(t=><option key={t}>{t}</option>)}</select></label></div>
        {loading ? <p className="muted">جاري تحميل الشحنات…</p> : error ? <p className="notice notice-warn">{error}</p> : visible.length === 0 ? <p className="empty">لا توجد شحنات مطابقة حالياً.</p> :
          <div className="cargo-grid">{visible.map(c=><article className="cargo-card" key={c.id}><div className="cargo-card-top"><span className="tag">{c.truck_type}</span><span className="muted">{c.loading_date}</span></div><h3>{c.title}</h3><p className="route">{c.origin_city}<span>←</span>{c.destination_city}</p><p className="muted">{c.goods_type} {c.weight_text ? " · "+c.weight_text : ""}</p>{c.offered_price_mad != null && <strong className="price">{c.offered_price_mad} درهم</strong>}</article>)}</div>}
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