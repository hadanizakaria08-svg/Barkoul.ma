import { useEffect, useMemo, useState, type FormEvent } from "react";
import { canPublishCargo, filterCargos, matchesGoodsCategory, normalizeCargoDraft, TRUCK_TYPES, validateCargoDraft, type Cargo, type CargoDraft, type ProfileRole } from "@barkoul/domain";
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
  return <svg className="brand-truck" viewBox="0 0 180 108" role="img" aria-label="شاحنة Barkoul.ma" focusable="false">
    <path d="M10 22h91a8 8 0 0 1 8 8v49H10a8 8 0 0 1-8-8V30a8 8 0 0 1 8-8Z" fill="#168be2" stroke="currentColor" strokeWidth="5" strokeLinejoin="round"/>
    <path d="M109 47h30l25 25v7h-55Z" fill="#ffd24a" stroke="currentColor" strokeWidth="5" strokeLinejoin="round"/>
    <path d="M119 54h17l17 18h-34Z" fill="#eaf6ff" stroke="currentColor" strokeWidth="4" strokeLinejoin="round"/>
    <path d="M20 34h70M20 48h55" stroke="#fff" strokeWidth="5" strokeLinecap="round" opacity=".9"/>
    <path d="M2 80h170" stroke="currentColor" strokeWidth="6" strokeLinecap="round"/>
    <circle cx="43" cy="84" r="14" fill="#fff" stroke="currentColor" strokeWidth="6"/>
    <circle cx="43" cy="84" r="5" fill="#168be2"/>
    <circle cx="139" cy="84" r="14" fill="#fff" stroke="currentColor" strokeWidth="6"/>
    <circle cx="139" cy="84" r="5" fill="#168be2"/>
    <path d="M7 12h34" stroke="#ffd24a" strokeWidth="6" strokeLinecap="round"/>
  </svg>;
}

function MoroccoMark() {
  return <svg className="morocco-mark" viewBox="0 0 220 330" role="img" aria-label="خريطة المغرب">
    <path d="M86 8 128 18 146 49 174 54 165 85 191 104 174 133 184 157 157 180 151 214 124 228 117 265 91 280 75 316 48 302 43 268 24 250 40 221 32 193 51 172 43 143 63 116 58 86 78 62Z" fill="#D62828" stroke="white" strokeWidth="7" strokeLinejoin="round"/>
    <path d="m100 104 15 35 37-1-30 22 12 36-34-23-31 23 11-37-30-21 38 1Z" fill="none" stroke="#087c42" strokeWidth="9" strokeLinejoin="round"/>
  </svg>;
}

function categoryArtwork(kind: "cans" | "plastic" | "paper" | "appliances" | "tractor" | "excavator") {
  const drawings: Record<typeof kind, string> = {
    cans: '<rect x="82" y="76" width="66" height="142" rx="12" fill="#e6f2fb" stroke="#1265a5" stroke-width="8"/><path d="M82 96h66M82 195h66" stroke="#1265a5" stroke-width="7"/><rect x="165" y="104" width="55" height="114" rx="11" fill="#ffd66b" stroke="#b87818" stroke-width="8"/><path d="M165 123h55M165 195h55" stroke="#b87818" stroke-width="7"/><path d="M101 130h28M101 151h28M181 153h22" stroke="#168be2" stroke-width="7" stroke-linecap="round"/>',
    plastic: '<path d="M105 66h52v27l15 19v104q0 13-13 13h-57q-13 0-13-13V112l16-19Z" fill="#d9f2ff" stroke="#0878bd" stroke-width="8" stroke-linejoin="round"/><path d="M111 66V48h40v18M93 145h78M107 169h50" fill="none" stroke="#0878bd" stroke-width="8" stroke-linecap="round"/><path d="m185 94 22 8-11 18M203 104q25 31-1 59M78 191l-21-7 9-19M58 183q-25-30 1-58" fill="none" stroke="#18a66a" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>',
    paper: '<path d="M65 112 128 77l68 35-66 38Z" fill="#f4d69c" stroke="#9a6a2c" stroke-width="7" stroke-linejoin="round"/><path d="M65 112v82l65 39v-83Z" fill="#dba968" stroke="#9a6a2c" stroke-width="7" stroke-linejoin="round"/><path d="M130 150v83l66-39v-82Z" fill="#c88d4d" stroke="#9a6a2c" stroke-width="7" stroke-linejoin="round"/><path d="m91 98 65 37M94 175l22 13M148 183l27-16" stroke="#fff0cf" stroke-width="7" stroke-linecap="round"/>',
    appliances: '<rect x="65" y="52" width="83" height="177" rx="12" fill="#f8fbff" stroke="#47708f" stroke-width="8"/><path d="M65 131h83M132 74v38M132 151v56" stroke="#47708f" stroke-width="7" stroke-linecap="round"/><rect x="165" y="103" width="73" height="126" rx="12" fill="#d9e8f4" stroke="#47708f" stroke-width="8"/><circle cx="201" cy="170" r="25" fill="#b6d8ed" stroke="#47708f" stroke-width="7"/><circle cx="201" cy="170" r="9" fill="#fff"/>',
    tractor: '<circle cx="92" cy="196" r="39" fill="#27384a" stroke="#172a3b" stroke-width="7"/><circle cx="92" cy="196" r="17" fill="#dce8ef"/><circle cx="202" cy="201" r="25" fill="#27384a" stroke="#172a3b" stroke-width="7"/><circle cx="202" cy="201" r="10" fill="#dce8ef"/><path d="M72 146h113l20 31H69Z" fill="#f2b82c" stroke="#8a5b0a" stroke-width="8" stroke-linejoin="round"/><path d="M114 144V91h53l23 55" fill="#e7f5ff" stroke="#8a5b0a" stroke-width="8" stroke-linejoin="round"/><path d="M123 101h35v35h-35Z" fill="#9ed7f5"/><path d="M55 177h-22v-18h32" fill="none" stroke="#8a5b0a" stroke-width="8" stroke-linecap="round"/>',
    excavator: '<path d="M83 174h108l-12 37H91Z" fill="#f2b82c" stroke="#8b5b0b" stroke-width="8" stroke-linejoin="round"/><path d="M91 211h112" stroke="#283b4c" stroke-width="15" stroke-linecap="round"/><circle cx="112" cy="211" r="10" fill="#d9e7ef"/><circle cx="181" cy="211" r="10" fill="#d9e7ef"/><path d="M122 170v-53h49l19 53" fill="#f8c947" stroke="#8b5b0b" stroke-width="8" stroke-linejoin="round"/><path d="M133 126h28v31h-28Z" fill="#bfe7fa"/><path d="M171 121 206 82l28 12-35 49M232 94l16-15 13 15-17 17" fill="none" stroke="#e3a51b" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/>'
  };
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 280"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#eff8ff"/><stop offset="1" stop-color="#dceeff"/></linearGradient></defs><rect width="300" height="280" rx="24" fill="url(#bg)"/><circle cx="244" cy="48" r="20" fill="#fff" opacity=".65"/><path d="M0 238q75-26 150 0t150 0v42H0Z" fill="#c5e2f5"/>' + drawings[kind] + '</svg>';
  return "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg);
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

  const [selectedGoods, setSelectedGoods] = useState("");
  const visible = useMemo(() => filterCargos(cargos, origin, destination, truck).filter(c => !selectedGoods || matchesGoodsCategory(c.goods_type, selectedGoods)), [cargos, origin, destination, truck, selectedGoods]);

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
      <header className="topbar home-topbar entry-topbar approved-entry-topbar">
        <a className="brand home-brand" href="./" aria-label="Barkoul.ma الصفحة الرئيسية"><BrandTruck/><span className="brand-word">Barkoul<span>.ma</span></span></a>
        <strong className="entry-country">ربط أصحاب البضائع بسائقي الشاحنات</strong>
        <nav aria-label="روابط التواصل" className="entry-social-nav">
          <a href="https://wa.me/" aria-label="واتساب">◉</a><a href="https://facebook.com/" aria-label="فيسبوك">f</a><a href="https://youtube.com/" aria-label="يوتيوب">▶</a><a href="https://linkedin.com/" aria-label="لينكدإن">in</a><a href="https://x.com/" aria-label="X">𝕏</a>
        </nav>
      </header>
      <main className="approved-entry-main">
        <section className="approved-entry-hero" aria-labelledby="entry-title">
          <div className="approved-entry-visual">
            <div className="approved-entry-map"><MoroccoMark/><span>شبكة نقل تربط مدن المغرب</span></div>
            <div className="approved-entry-vehicles">
              <img src="https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?auto=format&fit=crop&w=1100&q=90" alt="شاحنة نقل بضائع" fetchPriority="high"/>
              <img src="https://images.unsplash.com/photo-1570125909232-eb263c188f7e?auto=format&fit=crop&w=850&q=90" alt="حافلة نقل ركاب" fetchPriority="high"/>
            </div>
            <div className="approved-entry-brand">
              <BrandTruck/><strong>Barkoul<span>.ma</span></strong>
              <b>ربط أصحاب البضائع بسائقي الشاحنات</b>
            </div>
          </div>
          <section className="approved-login-card" id="entry-account" aria-labelledby="entry-account-title">
            {user ? <div className="entry-signed-in">
              <p className="eyebrow">مرحباً بعودتك</p><h2 id="entry-account-title">أنت مسجل الدخول بالفعل</h2>
              <a className="button button-primary" href="?page=services">الدخول إلى الموقع</a>
            </div> : <>
              <div className="approved-login-heading"><span aria-hidden="true">♙</span><h1 id="entry-account-title">{resetMode ? "استعادة كلمة المرور" : authMode === "login" ? "تسجيل الدخول" : "إنشاء حساب جديد"}</h1></div>
              <form className="approved-login-form" onSubmit={resetMode ? (e)=>{e.preventDefault();void sendPasswordReset();} : submitAuth}>
                {!resetMode && authMode === "signup" && <label>الاسم الكامل<input required maxLength={100} value={fullName} onChange={e=>setFullName(e.target.value)} autoComplete="name"/></label>}
                <label>البريد الإلكتروني<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" placeholder="البريد الإلكتروني"/></label>
                {!resetMode && <label>كلمة المرور<input type="password" minLength={6} required value={password} onChange={e=>setPassword(e.target.value)} autoComplete={authMode==="login"?"current-password":"new-password"} placeholder="كلمة المرور"/></label>}
                <button className="button button-primary approved-login-submit" disabled={busy || !db}>{busy?"جارٍ التنفيذ…":resetMode?"إرسال رابط الاستعادة":authMode==="login"?"دخول":"إنشاء حساب"}</button>
                {!resetMode && authMode==="login" && <button type="button" className="approved-reset-button" onClick={()=>{setResetMode(true);setAuthMessage("");}}>نسيت كلمة المرور؟</button>}
                <button type="button" className="text-button" onClick={()=>{if(resetMode){setResetMode(false);}else{setAuthMode(authMode==="login"?"signup":"login");}setAuthMessage("");}}>{resetMode?"العودة إلى الدخول":authMode==="login"?"ليس لديك حساب؟ أنشئ حساباً":"لديك حساب؟ سجل الدخول"}</button>
                {authMessage && <p className="form-message" role="status">{authMessage}</p>}
              </form>
              <div className="approved-login-social"><span>أو تابعنا على وسائل التواصل الاجتماعي</span><div className="social-links"><a href="https://wa.me/" aria-label="واتساب">◉</a><a href="https://facebook.com/" aria-label="فيسبوك">f</a><a href="https://youtube.com/" aria-label="يوتيوب">▶</a><a href="https://linkedin.com/" aria-label="لينكدإن">in</a><a href="https://x.com/" aria-label="X">𝕏</a></div></div>
            </>}
          </section>
        </section>
        <a className="approved-guest-entry" href="?page=services">تصفح خدمات الموقع كزائر <span>←</span></a>
      </main>
      <footer className="approved-entry-footer"><span>♧ دعم فني ومساعدة</span><span>✓ أمان وموثوقية</span><span>♧ سهولة في الاستخدام</span><span>▣ نقل سريع ومضمون</span><strong>Barkoul.ma — نقل آمن، تجارتك في أمان</strong></footer>
    </div>;
  }

  const cargoCategories = [
    ["الخضر والفواكه","photo-1540420773420-3366772f4999"],["الحبوب والدقيق","photo-1574323347407-f5e1ad6d020b"],["الألبان ومشتقاتها","photo-1563636619-e9143da7973b"],["المواد المجمدة","photo-1518843875459-f738682238a6"],
    ["الإسمنت","photo-1518709268805-4e9042af9f23"],["الآجر والطوب","photo-1581094794329-c8112a89af12"],["الحديد والمعادن","photo-1504917595217-d4dc5ebe6122"],["الرمل والحصى","photo-1518709268805-4e9042af9f23"],["السيراميك","photo-1600607687939-ce8a6c25118c"],["الخشب","photo-1530124566582-a618bc2615dc"],
    ["الأثاث","photo-1555041469-a586c61ea9bc"],["الأجهزة المنزلية","photo-1555041469-a586c61ea9bc"],["التجهيز والديكور","photo-1600210492486-724fe5c67fb0"],
    ["السلع المعلبة","photo-1607082349566-187342175e2f"],["الآلات الصناعية","photo-1581092335878-2d9ff86ca2bf"],["الأقمشة والملابس","photo- textile"],["البلاستيك","photo-1607082349566-187342175e2f"],["الورق والكرتون","photo-1607082349566-187342175e2f"],["الإلكترونيات","photo-1498049794561-7780e7231661"],
    ["السيارات","photo-1492144534655-ae79c964c9d7"],["معدات الحفر","photo- excavator"],["المعدات الفلاحية","photo- tractor"],["الأنابيب والمعادن","photo-1504917595217-d4dc5ebe6122"],["المولدات","photo-1518709268805-4e9042af9f23"],["الحمولات الضخمة","photo-1601584115197-04ecc0da31d7"],
    ["بضائع متنوعة","photo-1607082349566-187342175e2f"],["شحنات خاصة","photo-1601584115197-04ecc0da31d7"]
  ];
  const categoryImages: Record<string,string> = {
    "الخضر والفواكه":"https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=500&q=80",
    "الحبوب والدقيق":"https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?auto=format&fit=crop&w=500&q=80",
    "الألبان ومشتقاتها":"https://images.unsplash.com/photo-1563636619-e9143da7973b?auto=format&fit=crop&w=500&q=80",
    "المواد المجمدة":"https://images.unsplash.com/photo-1518843875459-f738682238a6?auto=format&fit=crop&w=500&q=80",
    "الإسمنت":"https://images.unsplash.com/photo-1581094794329-c8112a89af12?auto=format&fit=crop&w=500&q=80",
    "الآجر والطوب":"https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=500&q=80",
    "الحديد والمعادن":"https://images.unsplash.com/photo-1504917595217-d4dc5ebe6122?auto=format&fit=crop&w=500&q=80",
    "الرمل والحصى":"https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=500&q=80",
    "السيراميك":"https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=500&q=80",
    "الخشب":"https://images.unsplash.com/photo-1530124566582-a618bc2615dc?auto=format&fit=crop&w=500&q=80",
    "الأثاث":"https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=500&q=80",
    "الأجهزة المنزلية":categoryArtwork("appliances"),
    "التجهيز والديكور":"https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=500&q=80",
    "السلع المعلبة":categoryArtwork("cans"),
    "الآلات الصناعية":"https://images.unsplash.com/photo-1581092335878-2d9ff86ca2bf?auto=format&fit=crop&w=500&q=80",
    "الأقمشة والملابس":"https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=500&q=80",
    "البلاستيك":categoryArtwork("plastic"),
    "الورق والكرتون":categoryArtwork("paper"),
    "الإلكترونيات":"https://images.unsplash.com/photo-1498049794561-7780e7231661?auto=format&fit=crop&w=500&q=80",
    "السيارات":"https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&w=500&q=80",
    "معدات الحفر":categoryArtwork("excavator"),
    "المعدات الفلاحية":categoryArtwork("tractor"),
    "الأنابيب والمعادن":"https://images.unsplash.com/photo-1504917595217-d4dc5ebe6122?auto=format&fit=crop&w=500&q=80",
    "المولدات":"https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=500&q=80",
    "الحمولات الضخمة":"https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?auto=format&fit=crop&w=500&q=80",
    "بضائع متنوعة":"https://images.unsplash.com/photo-1607082349566-187342175e2f?auto=format&fit=crop&w=500&q=80",
    "شحنات خاصة":"https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?auto=format&fit=crop&w=500&q=80"
  };
  return <div className="app-shell">
    <header className="topbar home-topbar services-topbar approved-services-topbar">
      <a className="brand home-brand" href="./" aria-label="Barkoul.ma الصفحة الرئيسية"><BrandTruck/><span className="brand-word">Barkoul<span>.ma</span></span></a>
      <nav aria-label="التنقل"><a className="home-nav-link" href="./">الرئيسية</a><a className="home-nav-link" href="#search">أبحث عن شحنة</a><a className="account-entry" href={user ? "?page=publish#publish" : "?page=publish#publish-account"}>أنشر شحنة</a><a className="home-nav-link" href="#categories">خدماتنا</a><a className="home-nav-link" href="#footer">الدعم والمساعدة</a></nav>
    </header>
    <main>
      <section className="approved-services-hero">
        <div className="approved-services-hero-copy"><p className="home-kicker">منصتكم للنقل والشحن في المغرب</p><h1>Barkoul.ma</h1><h2>ربط أصحاب البضائع بسائقي الشاحنات</h2><div className="hero-actions"><a className="button button-primary" href={user ? "?page=publish#publish" : "?page=publish#publish-account"}>أنشر شحنة</a><a className="button button-light" href="#search">أبحث عن شحنة</a></div></div>
        <div className="approved-services-hero-photo"><img src="https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?auto=format&fit=crop&w=1100&q=90" alt="شاحنة نقل بضائع" fetchPriority="high"/><img src="https://images.unsplash.com/photo-1570125909232-eb263c188f7e?auto=format&fit=crop&w=700&q=85" alt="حافلة نقل" /></div>
      </section>
      <section className="approved-search-panel" id="search"><div className="approved-search-actions"><a className="button button-primary" href={user ? "?page=publish#publish" : "?page=publish#publish-account"}>أنشر شحنة</a><a className="button button-light" href="#available-cargos">أبحث عن شحنة</a></div><div className="filters"><label>من مدينة<input value={origin} onChange={e=>setOrigin(e.target.value)} placeholder="مثلاً الدار البيضاء"/></label><label>إلى مدينة<input value={destination} onChange={e=>setDestination(e.target.value)} placeholder="مثلاً مراكش"/></label><label>نوع الشاحنة<select value={truck} onChange={e=>setTruck(e.target.value)}><option value="">جميع الأنواع</option>{TRUCK_TYPES.map(t=><option key={t}>{t}</option>)}</select></label><button className="button button-primary" onClick={()=>document.getElementById("available-cargos")?.scrollIntoView({behavior:"smooth"})}>بحث الآن</button></div></section>
      <section className="approved-categories" id="categories" aria-label="جميع أنواع الشحنات"><div className="category-heading"><p className="eyebrow">كل أنواع النقل</p><h2>جميع أنواع الشحنات والبضائع</h2><p>اختر السلعة لعرض الشحنات المطابقة، أو استخدم «شحنات أخرى» إذا لم تجد نوع بضاعتك.</p></div><div className="approved-category-grid">{cargoCategories.map(([name])=><a key={name} href="#available-cargos" onClick={()=>setSelectedGoods(name)}><img src={categoryImages[name] || categoryImages["بضائع متنوعة"]} alt={name} loading="lazy"/><strong>{name}</strong></a>)}</div><div className="approved-other-note"><strong>شحنات أخرى</strong><span>لم تجد السلعة؟ يمكنك كتابة اسمها وإضافة صورتها عند نشر الشحنة.</span><a href={user ? "?page=publish#publish" : "?page=publish#publish-account"}>أضف شحنة أخرى</a></div></section>
      {!db && <div className="notice notice-warn">الاتصال بقاعدة البيانات غير مضبوط بعد. أضف متغيرات البيئة في إعدادات البناء قبل اختبار الحسابات والشحنات.</div>}
      <section className="section" id="available-cargos"><div className="section-heading"><div><p className="eyebrow">اكتشف الفرص</p><h2>الشحنات المتاحة</h2></div><button className="button button-outline" onClick={refresh} disabled={!db || loading}>تحديث</button></div>
        {selectedGoods && <p className="selected-category">التصنيف المختار: {selectedGoods} <button className="text-button" onClick={()=>setSelectedGoods("")}>إلغاء التصفية</button></p>}
        <div className="filters"><label>من مدينة<input value={origin} onChange={e=>setOrigin(e.target.value)} placeholder="مثلاً الدار البيضاء"/></label><label>إلى مدينة<input value={destination} onChange={e=>setDestination(e.target.value)} placeholder="مثلاً مراكش"/></label><label>نوع الشاحنة<select value={truck} onChange={e=>setTruck(e.target.value)}><option value="">جميع الأنواع</option>{TRUCK_TYPES.map(t=><option key={t}>{t}</option>)}</select></label></div>
        {loading ? <p className="muted">جاري تحميل الشحنات…</p> : error ? <p className="notice notice-warn">{error}</p> : visible.length === 0 ? <p className="empty">لا توجد شحنات مطابقة حالياً.</p> :
          <div className="cargo-grid">{visible.map(c=><article className="cargo-card" key={c.id}><div className="cargo-card-top"><span className="tag">{c.truck_type}</span><span className="muted">{c.loading_date}</span></div><h3>{c.title}</h3><p className="route">{c.origin_city}<span>←</span>{c.destination_city}</p><p className="muted">{c.goods_type} {c.weight_text ? " · "+c.weight_text : ""}</p>{c.offered_price_mad != null && <strong className="price">{c.offered_price_mad} درهم</strong>}</article>)}</div>}
      </section>
      {user && (profileRole === "owner" || profileRole === "driver") && <Workspace userId={user.id} role={profileRole} openCargos={cargos}/>}
    </main>
    <footer className="reference-footer" id="footer"><div className="social-links" aria-label="روابط التواصل"><a href="https://wa.me/" aria-label="واتساب">◉</a><a href="https://facebook.com/" aria-label="فيسبوك">f</a><a href="https://youtube.com/" aria-label="يوتيوب">▶</a><a href="https://linkedin.com/" aria-label="لينكدإن">in</a><a href="https://x.com/" aria-label="X">𝕏</a></div><strong>Barkoul.ma — نقل آمن، تجارتك في أمان</strong></footer>
  </div>;

}