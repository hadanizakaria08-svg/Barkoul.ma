import { useEffect, useMemo, useState, type FormEvent } from "react";
import { canPublishCargo, filterCargos, normalizeCargoDraft, TRUCK_TYPES, validateCargoDraft, type Cargo, type CargoDraft, type ProfileRole } from "@barkoul/domain";
import { getCurrentProfileRole, getSupabase, listOpenCargos, publishCargo } from "@barkoul/data";

const initialDraft: CargoDraft = {
  title: "", origin_city: "", destination_city: "", goods_type: "",
  weight_text: "", truck_type: "", loading_date: "", offered_price_mad: null, notes: ""
};

const todayLocal = () => {
  const now = new Date();
  return [now.getFullYear(), String(now.getMonth()+1).padStart(2,"0"), String(now.getDate()).padStart(2,"0")].join("-");
};

export default function App() {
  const db = getSupabase();
  const [cargos, setCargos] = useState<Cargo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [user, setUser] = useState<{id:string; email?:string} | null>(null);
  const [profileRole, setProfileRole] = useState<ProfileRole | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState("");
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

  async function refresh() {
    setLoading(true); setError("");
    try { setCargos(await listOpenCargos()); }
    catch (e) { setError(e instanceof Error ? e.message : "تعذر تحميل الشحنات."); }
    finally { setLoading(false); }
  }

  async function refreshProfileRole() {
    if (!db || !user) return;
    setProfileLoading(true);
    setProfileError("");
    try {
      setProfileRole(await getCurrentProfileRole());
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
    getCurrentProfileRole()
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

  const visible = useMemo(() => filterCargos(cargos, origin, destination, truck), [cargos, origin, destination, truck]);

  async function submitAuth(event: FormEvent) {
    event.preventDefault(); if (!db) return;
    setBusy(true); setAuthMessage("");
    try {
      const result = authMode === "login"
        ? await db.auth.signInWithPassword({email:email.trim(),password})
        : await db.auth.signUp({email:email.trim(),password,options:{data:{full_name:fullName.trim()}}});
      if (result.error) throw result.error;
      setAuthMessage(authMode === "signup" && !result.data.session
        ? "تم إنشاء الحساب. تحقق من بريدك الإلكتروني إذا طُلب منك ذلك."
        : "تمت العملية بنجاح.");
    } catch (e) { setAuthMessage(e instanceof Error ? e.message : "تعذر إتمام العملية."); }
    finally { setBusy(false); }
  }

  async function sendPasswordReset() {
    if (!db || !email.trim()) { setAuthMessage("أدخل بريدك الإلكتروني أولاً."); return; }
    setBusy(true); setAuthMessage("");
    try {
      const { error } = await db.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin + window.location.pathname });
      if (error) throw error;
      setAuthMessage("إذا كان البريد مسجلاً، فستصلك رسالة لإعادة تعيين كلمة المرور.");
    } catch (e) { setAuthMessage(e instanceof Error ? e.message : "تعذر إرسال رسالة الاستعادة."); }
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
    } catch (e) { setPublishMessage(e instanceof Error ? e.message : "تعذر نشر الشحنة."); }
    finally { setBusy(false); }
  }

  return <div className="app-shell">
    <header className="topbar"><a className="brand" href="#">Barkoul<span>.ma</span></a>
      <nav><a href="#search">الشحنات</a><a href="#publish">نشر شحنة</a>
      {user ? <button className="button button-outline" onClick={async()=>{await db?.auth.signOut();}}>تسجيل الخروج</button> : <a href="#account">دخول / حساب جديد</a>}</nav>
    </header>
    <main>
      <section className="hero">
        <div className="hero-copy"><p className="eyebrow">منصة النقل المغربية</p>
          <h1>شحناتك تجد طريقها.<br/><span>وشاحنتك تجد عملها.</span></h1>
          <p>منصة تربط أصحاب البضائع بسائقي الشاحنات في مختلف مدن المغرب.</p>
          <div className="hero-actions"><a className="button button-primary" href="#search">أبحث عن شحنة</a><a className="button button-light" href="#publish">أنشر شحنة</a></div>
        </div>
        <div className="hero-art" aria-hidden="true"><div className="route-line"></div><div className="map-pin pin-a">●</div><div className="truck-emoji">🚚</div><div className="map-pin pin-b">●</div><span className="art-label">من الانطلاق إلى الوصول</span></div>
      </section>

      <section className="trust-strip"><div><strong>تصفح بسهولة</strong><span>شاهد الشحنات المتاحة</span></div><div><strong>تواصل بوضوح</strong><span>خطوات نقل منظمة</span></div><div><strong>منصة مغربية</strong><span>مصممة للسوق المحلي</span></div></section>

      {!db && <div className="notice notice-warn">الاتصال بقاعدة البيانات غير مضبوط بعد. أضف متغيرات البيئة في إعدادات البناء قبل اختبار الحسابات والشحنات.</div>}

      <section className="section" id="search"><div className="section-heading"><div><p className="eyebrow">اكتشف الفرص</p><h2>الشحنات المتاحة</h2></div><button className="button button-outline" onClick={refresh} disabled={!db || loading}>تحديث</button></div>
        <div className="filters"><label>من مدينة<input value={origin} onChange={e=>setOrigin(e.target.value)} placeholder="مثلاً الدار البيضاء"/></label><label>إلى مدينة<input value={destination} onChange={e=>setDestination(e.target.value)} placeholder="مثلاً مراكش"/></label><label>نوع الشاحنة<select value={truck} onChange={e=>setTruck(e.target.value)}><option value="">جميع الأنواع</option>{TRUCK_TYPES.map(t=><option key={t}>{t}</option>)}</select></label></div>
        {loading ? <p className="muted">جاري تحميل الشحنات…</p> : error ? <p className="notice notice-warn">{error}</p> : visible.length === 0 ? <p className="empty">لا توجد شحنات مطابقة حالياً.</p> :
          <div className="cargo-grid">{visible.map(c=><article className="cargo-card" key={c.id}><div className="cargo-card-top"><span className="tag">{c.truck_type}</span><span className="muted">{c.loading_date}</span></div><h3>{c.title}</h3><p className="route">{c.origin_city}<span>←</span>{c.destination_city}</p><p className="muted">{c.goods_type} {c.weight_text ? " · "+c.weight_text : ""}</p>{c.offered_price_mad != null && <strong className="price">{c.offered_price_mad} درهم</strong>}</article>)}</div>}
      </section>

      <section className="section split" id="account"><div><p className="eyebrow">حسابك على Barkoul</p><h2>{resetMode ? "استعادة كلمة المرور" : authMode === "login" ? "مرحباً بعودتك" : "أنشئ حسابك"}</h2><p className="muted">يمكنك تصفح الشحنات دون حساب. يلزم تسجيل الدخول لنشر شحنة.</p></div>
        <form className="form-card" onSubmit={resetMode ? (e)=>{e.preventDefault();void sendPasswordReset();} : submitAuth}>{!resetMode && authMode === "signup" && <label>الاسم الكامل<input required maxLength={100} value={fullName} onChange={e=>setFullName(e.target.value)} autoComplete="name"/></label>}<label>البريد الإلكتروني<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email"/></label>{!resetMode && <label>كلمة المرور<input type="password" minLength={6} required value={password} onChange={e=>setPassword(e.target.value)} autoComplete={authMode==="login"?"current-password":"new-password"}/></label>}<button className="button button-primary" disabled={busy || !db}>{busy?"جارٍ التنفيذ…":resetMode?"إرسال رابط الاستعادة":authMode==="login"?"تسجيل الدخول":"إنشاء حساب"}</button>{!resetMode && authMode==="login" && <button type="button" className="text-button" onClick={()=>{setResetMode(true);setAuthMessage("");}}>نسيت كلمة المرور؟</button>}<button type="button" className="text-button" onClick={()=>{setResetMode(false);setAuthMode(authMode==="login"?"signup":"login");setAuthMessage("");}}>{resetMode?"العودة إلى الدخول":authMode==="login"?"ليس لديك حساب؟ أنشئ حساباً":"لديك حساب؟ سجل الدخول"}</button>{authMessage && <p className="form-message" role="status">{authMessage}</p>}</form>
      </section>

      <section className="section" id="publish"><div className="section-heading"><div><p className="eyebrow">أضف فرصة نقل</p><h2>نشر شحنة جديدة</h2></div></div>
        <form className="form-card cargo-form" onSubmit={submitCargo}><label>عنوان الشحنة<input required maxLength={120} value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})}/></label><div className="form-grid"><label>مدينة الانطلاق<input required maxLength={100} value={draft.origin_city} onChange={e=>setDraft({...draft,origin_city:e.target.value})}/></label><label>مدينة الوصول<input required maxLength={100} value={draft.destination_city} onChange={e=>setDraft({...draft,destination_city:e.target.value})}/></label><label>نوع البضاعة<input required value={draft.goods_type} onChange={e=>setDraft({...draft,goods_type:e.target.value})} placeholder="خضر، فواكه، مواد بناء…"/></label><label>الوزن<input value={draft.weight_text ?? ""} onChange={e=>setDraft({...draft,weight_text:e.target.value || null})}/></label><label>نوع الشاحنة<select required value={draft.truck_type} onChange={e=>setDraft({...draft,truck_type:e.target.value})}><option value="">اختر النوع</option>{TRUCK_TYPES.map(t=><option key={t}>{t}</option>)}</select></label><label>تاريخ النقل<input type="date" required min={todayLocal()} value={draft.loading_date} onChange={e=>setDraft({...draft,loading_date:e.target.value})}/></label><label>السعر المقترح (درهم)<input type="number" min="0" step="0.01" value={draft.offered_price_mad ?? ""} onChange={e=>setDraft({...draft,offered_price_mad:e.target.value===""?null:Number(e.target.value)})}/></label></div><label>ملاحظات<textarea maxLength={1000} value={draft.notes ?? ""} onChange={e=>setDraft({...draft,notes:e.target.value || null})}/></label><button className="button button-primary" disabled={busy || !user || profileLoading || !canPublishCargo(profileRole)}>{busy?"جارٍ النشر…":"نشر الشحنة"}</button>{user && profileLoading && <p className="form-message" role="status">جارٍ التحقق من صلاحية الحساب…</p>}{user && profileError && <p className="form-message" role="status">{profileError}</p>}{user && !profileLoading && !canPublishCargo(profileRole) && <><p className="form-message" role="status">{profileError || "حسابك مسجل، لكن لم يُفعّل بعد كصاحب بضاعة. تواصل مع الإدارة لتفعيل صلاحية نشر الشحنات."}</p><button type="button" className="text-button" onClick={() => void refreshProfileRole()} disabled={profileLoading}>إعادة التحقق من الصلاحية</button></>}{publishMessage && <p className="form-message" role="status">{publishMessage}</p>}</form>
      </section>
    </main>
    <footer><strong>Barkoul.ma</strong><span>منصة مغربية قيد التطوير والاختبار.</span></footer>
  </div>;
}