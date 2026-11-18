import { useEffect, useMemo, useState, type FormEvent } from "react";
import { filterCargos, validateCargoDraft, type Cargo, type CargoDraft } from "@barkoul/domain";
import { getSupabase, listOpenCargos, publishCargo } from "@barkoul/data";

const initialDraft: CargoDraft = {
  title: "", origin_city: "", destination_city: "", goods_type: "",
  weight_text: "", truck_type: "", loading_date: "", offered_price_mad: null, notes: ""
};

const truckTypes = ["شاحنة كبيرة", "شاحنة متوسطة", "شاحنة صغيرة", "جرار ومقطورة", "شاحنة تبريد"];

export default function App() {
  const db = getSupabase();
  const [cargos, setCargos] = useState<Cargo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [user, setUser] = useState<{id:string; email?:string} | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMode, setAuthMode] = useState<"login"|"signup">("login");
  const [authMessage, setAuthMessage] = useState("");
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

  useEffect(() => {
    if (!db) { setLoading(false); return; }
    let alive = true;
    db.auth.getSession().then(({data}) => {
      if (alive) setUser(data.session?.user ? {id:data.session.user.id,email:data.session.user.email} : null);
    });
    const {data:{subscription}} = db.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ? {id:session.user.id,email:session.user.email} : null);
    });
    refresh();
    return () => { alive = false; subscription.unsubscribe(); };
  }, []);

  const visible = useMemo(() => filterCargos(cargos, origin, destination, truck), [cargos, origin, destination, truck]);

  async function submitAuth(event: FormEvent) {
    event.preventDefault(); if (!db) return;
    setBusy(true); setAuthMessage("");
    try {
      const result = authMode === "login"
        ? await db.auth.signInWithPassword({email:email.trim(),password})
        : await db.auth.signUp({email:email.trim(),password});
      if (result.error) throw result.error;
      setAuthMessage(authMode === "signup" && !result.data.session
        ? "تم إنشاء الحساب. تحقق من بريدك الإلكتروني إذا طُلب منك ذلك."
        : "تمت العملية بنجاح.");
    } catch (e) { setAuthMessage(e instanceof Error ? e.message : "تعذر إتمام العملية."); }
    finally { setBusy(false); }
  }

  async function submitCargo(event: FormEvent) {
    event.preventDefault(); setPublishMessage("");
    if (!user) { setPublishMessage("سجّل الدخول أولاً."); return; }
    const errors = validateCargoDraft(draft, new Date().toLocaleDateString("en-CA"));
    if (errors.length) { setPublishMessage(errors.join(" ")); return; }
    setBusy(true);
    try {
      await publishCargo(user.id, draft);
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

      <section className="section" id="search"><div className="section-heading"><div><p className="eyebrow">اكتشف الفرص</p><h2>الشحنات المتاحة</h2></div><button className="button button-outline" onClick={refresh}>تحديث</button></div>
        <div className="filters"><label>من مدينة<input value={origin} onChange={e=>setOrigin(e.target.value)} placeholder="مثلاً الدار البيضاء"/></label><label>إلى مدينة<input value={destination} onChange={e=>setDestination(e.target.value)} placeholder="مثلاً مراكش"/></label><label>نوع الشاحنة<select value={truck} onChange={e=>setTruck(e.target.value)}><option value="">جميع الأنواع</option>{truckTypes.map(t=><option key={t}>{t}</option>)}</select></label></div>
        {loading ? <p className="muted">جاري تحميل الشحنات…</p> : error ? <p className="notice notice-warn">{error}</p> : visible.length === 0 ? <p className="empty">لا توجد شحنات مطابقة حالياً.</p> :
          <div className="cargo-grid">{visible.map(c=><article className="cargo-card" key={c.id}><div className="cargo-card-top"><span className="tag">{c.truck_type}</span><span className="muted">{c.loading_date}</span></div><h3>{c.title}</h3><p className="route">{c.origin_city}<span>←</span>{c.destination_city}</p><p className="muted">{c.goods_type} {c.weight_text ? " · "+c.weight_text : ""}</p>{c.offered_price_mad != null && <strong className="price">{c.offered_price_mad} درهم</strong>}</article>)}</div>}
      </section>

      <section className="section split" id="account"><div><p className="eyebrow">حسابك على Barkoul</p><h2>{authMode === "login" ? "مرحباً بعودتك" : "أنشئ حسابك"}</h2><p className="muted">يمكنك تصفح الشحنات دون حساب. يلزم تسجيل الدخول لنشر شحنة.</p></div>
        <form className="form-card" onSubmit={submitAuth}><label>البريد الإلكتروني<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email"/></label><label>كلمة المرور<input type="password" minLength={6} required value={password} onChange={e=>setPassword(e.target.value)} autoComplete={authMode==="login"?"current-password":"new-password"}/></label><button className="button button-primary" disabled={busy || !db}>{busy?"جارٍ التنفيذ…":authMode==="login"?"تسجيل الدخول":"إنشاء حساب"}</button><button type="button" className="text-button" onClick={()=>{setAuthMode(authMode==="login"?"signup":"login");setAuthMessage("");}}>{authMode==="login"?"ليس لديك حساب؟ أنشئ حساباً":"لديك حساب؟ سجل الدخول"}</button>{authMessage && <p className="form-message" role="status">{authMessage}</p>}</form>
      </section>

      <section className="section" id="publish"><div className="section-heading"><div><p className="eyebrow">أضف فرصة نقل</p><h2>نشر شحنة جديدة</h2></div></div>
        <form className="form-card cargo-form" onSubmit={submitCargo}><label>عنوان الشحنة<input required maxLength={120} value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})}/></label><div className="form-grid"><label>مدينة الانطلاق<input required maxLength={100} value={draft.origin_city} onChange={e=>setDraft({...draft,origin_city:e.target.value})}/></label><label>مدينة الوصول<input required maxLength={100} value={draft.destination_city} onChange={e=>setDraft({...draft,destination_city:e.target.value})}/></label><label>نوع البضاعة<input required value={draft.goods_type} onChange={e=>setDraft({...draft,goods_type:e.target.value})} placeholder="خضر، فواكه، مواد بناء…"/></label><label>الوزن<input value={draft.weight_text ?? ""} onChange={e=>setDraft({...draft,weight_text:e.target.value || null})}/></label><label>نوع الشاحنة<select required value={draft.truck_type} onChange={e=>setDraft({...draft,truck_type:e.target.value})}><option value="">اختر النوع</option>{truckTypes.map(t=><option key={t}>{t}</option>)}</select></label><label>تاريخ النقل<input type="date" required min={new Date().toLocaleDateString("en-CA")} value={draft.loading_date} onChange={e=>setDraft({...draft,loading_date:e.target.value})}/></label><label>السعر المقترح (درهم)<input type="number" min="0" step="0.01" value={draft.offered_price_mad ?? ""} onChange={e=>setDraft({...draft,offered_price_mad:e.target.value===""?null:Number(e.target.value)})}/></label></div><label>ملاحظات<textarea maxLength={1000} value={draft.notes ?? ""} onChange={e=>setDraft({...draft,notes:e.target.value || null})}/></label><button className="button button-primary" disabled={busy || !user}>{busy?"جارٍ النشر…":"نشر الشحنة"}</button>{publishMessage && <p className="form-message" role="status">{publishMessage}</p>}</form>
      </section>
    </main>
    <footer><strong>Barkoul.ma</strong><span>منصة مغربية قيد التطوير والاختبار.</span></footer>
  </div>;
}