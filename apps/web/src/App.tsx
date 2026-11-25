import { useEffect, useMemo, useState, type FormEvent } from "react";
import { canPublishCargo, filterCargos, matchesGoodsCategory, normalizeCargoDraft, TRUCK_TYPES, BUS_TYPES, validateCargoDraft, type Cargo, type CargoDraft, type ProfileRole } from "@barkoul/domain";
import { getCurrentProfileRole, getSupabase, listOpenCargos, publishCargo } from "@barkoul/data";
import AdminRoom from "./AdminRoom";
import Workspace from "./Workspace";

const initialDraft: CargoDraft = {
  title: "", origin_city: "", destination_city: "", goods_type: "",
  weight_text: "", truck_type: "", loading_date: "", offered_price_mad: null, notes: ""
};


const VEHICLE_GROUPS = [
  { key: "large", title: "الشاحنات الكبيرة", image: "https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?auto=format&fit=crop&w=900&q=85", types: ["شاحنة كبيرة", "شاحنة متوسطة", "جرار ومقطورة", "شاحنة تبريد", "شاحنة مسطحة", "شاحنة مغطاة", "شاحنة بصندوق مغلق", "شاحنة قلاب", "شاحنة صهريج"] },
  { key: "small", title: "الشاحنات الصغيرة", image: "https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?auto=format&fit=crop&w=900&q=85", types: ["شاحنة صغيرة بصندوق مغلق", "شاحنة صغيرة سطحة", "شاحنة صغيرة مغطاة", "شاحنة صغيرة مبردة", "بيك أب", "شاحنة صغيرة قلاب"] },
  { key: "bus", title: "الحافلات", image: "https://images.unsplash.com/photo-1570125909232-eb263c188f7e?auto=format&fit=crop&w=900&q=85", types: [...BUS_TYPES] }
] as const;
\nconst todayLocal = () => {
  const now = new Date();
  return [now.getFullYear(), String(now.getMonth()+1).padStart(2,"0"), String(now.getDate()).padStart(2,"0")].join("-");
};

function passkeyErrorMessage(error: unknown): string {
  const e = error as { code?: string; message?: string; name?: string };
  const code = String(e?.code ?? "").toLowerCase();
  const message = String(e?.message ?? "").toLowerCase();
  if (code === "passkey_disabled") return "تسجيل الدخول بمفتاح المرور غير مفعّل في إعدادات المشروع.";
  if (code === "webauthn_credential_exists") return "هذا المفتاح مسجل بالفعل في حسابك.";
  if (code === "webauthn_credential_not_found") return "لم يتم العثور على مفتاح مرور لهذا الحساب على هذا الجهاز.";
  if (code === "email_not_confirmed") return "أكد بريدك الإلكتروني أولاً قبل استخدام مفتاح المرور.";
  if (code.includes("cancel") || e?.name === "NotAllowedError" || message.includes("cancel")) return "تم إلغاء عملية التحقق أو انتهت مهلة الاستجابة.";
  if (message.includes("not supported") || e?.name === "NotSupportedError") return "هذا المتصفح أو الجهاز لا يدعم مفاتيح المرور. جرّب متصفحاً حديثاً على HTTPS.";
  if (message.includes("secure context") || e?.name === "SecurityError") return "يلزم فتح Barkoul.ma عبر اتصال HTTPS آمن لاستخدام مفتاح المرور.";
  return "تعذر إتمام التحقق بمفتاح المرور. تأكد من إعداد قفل الشاشة أو البصمة في جهازك ثم حاول مجدداً.";
}

function authErrorMessage(error: unknown): string {
  const authError = error as { code?: string; message?: string; status?: number };
  const code = String(authError?.code ?? "").toLowerCase();
  const message = String(authError?.message ?? "").toLowerCase();
  if (code === "invalid_credentials" || code === "invalid_login_credentials") return "البريد الإلكتروني أو كلمة المرور غير صحيحة.";
  if (code === "email_not_confirmed") return "يجب تأكيد البريد الإلكتروني قبل تسجيل الدخول. تحقق من صندوق الوارد والرسائل غير المرغوب فيها.";
  if (code === "user_already_exists" || code === "email_exists") return "هذا البريد مسجل بالفعل. اختر تسجيل الدخول بدلاً من إنشاء حساب جديد.";
  if (code === "weak_password" || message.includes("password should be")) return "كلمة المرور لا تستوفي شروط الأمان. استخدم كلمة مرور أقوى.";
  if (code === "over_email_send_rate_limit" || code === "too_many_requests" || authError?.status === 429) return "تم تجاوز عدد المحاولات المسموح مؤقتاً. انتظر قليلاً ثم حاول مجدداً.";
  if (message.includes("failed to fetch") || message.includes("network") || message.includes("timeout")) return "تعذر الاتصال بخدمة الحسابات. تحقق من الإنترنت وحاول مجدداً.";
  return "تعذر إتمام العملية. راجع البريد وكلمة المرور وحالة الاتصال، ثم حاول مجدداً.";
}

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
  return <img
    className="morocco-mark"
    src="https://upload.wikimedia.org/wikipedia/commons/d/d1/Morocco_full_map.svg"
    alt="خريطة المغرب كاملة"
    loading="lazy"
  />;
}

function categoryArtwork(kind: "cans" | "plastic" | "paper" | "appliances" | "tractor" | "excavator" | "bricks" | "gravel" | "pipes" | "boxes" | "special" | "generator" | "frozen" | "cement") {
  const drawings: Record<typeof kind, string> = {
    cans: '<rect x="82" y="76" width="66" height="142" rx="12" fill="#e6f2fb" stroke="#1265a5" stroke-width="8"/><path d="M82 96h66M82 195h66" stroke="#1265a5" stroke-width="7"/><rect x="165" y="104" width="55" height="114" rx="11" fill="#ffd66b" stroke="#b87818" stroke-width="8"/><path d="M165 123h55M165 195h55" stroke="#b87818" stroke-width="7"/><path d="M101 130h28M101 151h28M181 153h22" stroke="#168be2" stroke-width="7" stroke-linecap="round"/>',
    plastic: '<path d="M105 66h52v27l15 19v104q0 13-13 13h-57q-13 0-13-13V112l16-19Z" fill="#d9f2ff" stroke="#0878bd" stroke-width="8" stroke-linejoin="round"/><path d="M111 66V48h40v18M93 145h78M107 169h50" fill="none" stroke="#0878bd" stroke-width="8" stroke-linecap="round"/><path d="m185 94 22 8-11 18M203 104q25 31-1 59M78 191l-21-7 9-19M58 183q-25-30 1-58" fill="none" stroke="#18a66a" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>',
    paper: '<path d="M65 112 128 77l68 35-66 38Z" fill="#f4d69c" stroke="#9a6a2c" stroke-width="7" stroke-linejoin="round"/><path d="M65 112v82l65 39v-83Z" fill="#dba968" stroke="#9a6a2c" stroke-width="7" stroke-linejoin="round"/><path d="M130 150v83l66-39v-82Z" fill="#c88d4d" stroke="#9a6a2c" stroke-width="7" stroke-linejoin="round"/><path d="m91 98 65 37M94 175l22 13M148 183l27-16" stroke="#fff0cf" stroke-width="7" stroke-linecap="round"/>',
    appliances: '<rect x="65" y="52" width="83" height="177" rx="12" fill="#f8fbff" stroke="#47708f" stroke-width="8"/><path d="M65 131h83M132 74v38M132 151v56" stroke="#47708f" stroke-width="7" stroke-linecap="round"/><rect x="165" y="103" width="73" height="126" rx="12" fill="#d9e8f4" stroke="#47708f" stroke-width="8"/><circle cx="201" cy="170" r="25" fill="#b6d8ed" stroke="#47708f" stroke-width="7"/><circle cx="201" cy="170" r="9" fill="#fff"/>',
    tractor: '<circle cx="92" cy="196" r="39" fill="#27384a" stroke="#172a3b" stroke-width="7"/><circle cx="92" cy="196" r="17" fill="#dce8ef"/><circle cx="202" cy="201" r="25" fill="#27384a" stroke="#172a3b" stroke-width="7"/><circle cx="202" cy="201" r="10" fill="#dce8ef"/><path d="M72 146h113l20 31H69Z" fill="#f2b82c" stroke="#8a5b0a" stroke-width="8" stroke-linejoin="round"/><path d="M114 144V91h53l23 55" fill="#e7f5ff" stroke="#8a5b0a" stroke-width="8" stroke-linejoin="round"/><path d="M123 101h35v35h-35Z" fill="#9ed7f5"/><path d="M55 177h-22v-18h32" fill="none" stroke="#8a5b0a" stroke-width="8" stroke-linecap="round"/>',
    excavator: '<path d="M83 174h108l-12 37H91Z" fill="#f2b82c" stroke="#8b5b0b" stroke-width="8" stroke-linejoin="round"/><path d="M91 211h112" stroke="#283b4c" stroke-width="15" stroke-linecap="round"/><circle cx="112" cy="211" r="10" fill="#d9e7ef"/><circle cx="181" cy="211" r="10" fill="#d9e7ef"/><path d="M122 170v-53h49l19 53" fill="#f8c947" stroke="#8b5b0b" stroke-width="8" stroke-linejoin="round"/><path d="M133 126h28v31h-28Z" fill="#bfe7fa"/><path d="M171 121 206 82l28 12-35 49M232 94l16-15 13 15-17 17" fill="none" stroke="#e3a51b" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/>',
    bricks: '<path d="M55 100h88v42H55Z M157 100h88v42h-88Z M105 151h88v42h-88Z M55 202h88v42H55Z M157 202h88v42h-88Z" fill="#c96e43" stroke="#8b4328" stroke-width="7" stroke-linejoin="round"/><path d="M55 121h88M157 121h88M105 172h88M55 223h88M157 223h88" stroke="#f3b18d" stroke-width="6"/>',
    gravel: '<path d="M38 220q24-58 60-70 19-45 49-28 31-49 59-14 33-5 55 48l17 64Z" fill="#c6a77b" stroke="#8c765a" stroke-width="7" stroke-linejoin="round"/><g fill="#e8d5b7" stroke="#9c8769" stroke-width="4"><ellipse cx="76" cy="205" rx="17" ry="12"/><ellipse cx="111" cy="181" rx="15" ry="11"/><ellipse cx="145" cy="211" rx="19" ry="13"/><ellipse cx="181" cy="175" rx="17" ry="12"/><ellipse cx="216" cy="210" rx="18" ry="13"/><ellipse cx="156" cy="151" rx="13" ry="10"/><ellipse cx="91" cy="224" rx="12" ry="9"/></g>',
    pipes: '<g stroke="#356783" stroke-width="8"><path d="M55 104h160v46H55Z" fill="#9ec6df"/><ellipse cx="55" cy="127" rx="18" ry="23" fill="#dff2ff"/><ellipse cx="215" cy="127" rx="18" ry="23" fill="#6f9db9"/><path d="M84 174h145v46H84Z" fill="#b7d7e9"/><ellipse cx="84" cy="197" rx="18" ry="23" fill="#eaf7ff"/><ellipse cx="229" cy="197" rx="18" ry="23" fill="#6f9db9"/></g><g fill="none" stroke="#fff" stroke-width="6"><ellipse cx="55" cy="127" rx="8" ry="13"/><ellipse cx="84" cy="197" rx="8" ry="13"/></g>',
    boxes: '<path d="M42 137 102 104l61 33-61 34Z" fill="#f1d29d" stroke="#9a6b32" stroke-width="7" stroke-linejoin="round"/><path d="M42 137v69l60 35v-70Z" fill="#d8a968" stroke="#9a6b32" stroke-width="7" stroke-linejoin="round"/><path d="M102 171v70l61-35v-69Z" fill="#c58c4c" stroke="#9a6b32" stroke-width="7" stroke-linejoin="round"/><path d="m102 104 20-11 61 33-20 11M183 126v66l-20 14" fill="#f7dfb7" stroke="#9a6b32" stroke-width="7" stroke-linejoin="round"/><path d="m102 171 20-12 61 33-20 12Z" fill="#e6bd82" stroke="#9a6b32" stroke-width="6" stroke-linejoin="round"/>',
    special: '<rect x="56" y="105" width="188" height="112" rx="13" fill="#e5f3fb" stroke="#356783" stroke-width="8"/><path d="M56 142h188M94 105v112M206 105v112" stroke="#356783" stroke-width="7"/><path d="m150 139 10 20 22 3-16 15 4 22-20-11-20 11 4-22-16-15 22-3Z" fill="#ffd24a" stroke="#9b6c0d" stroke-width="5" stroke-linejoin="round"/><path d="M72 88h156" stroke="#168be2" stroke-width="8" stroke-linecap="round"/>',
    generator: '<rect x="62" y="105" width="176" height="116" rx="13" fill="#dce9f2" stroke="#34566e" stroke-width="8"/><path d="M62 135h176M82 158h76v42H82Z" fill="#8fb1c7" stroke="#34566e" stroke-width="6"/><circle cx="188" cy="178" r="17" fill="#ffd24a" stroke="#34566e" stroke-width="6"/><path d="M91 105V83h118v22M92 221v16M208 221v16" stroke="#34566e" stroke-width="8" stroke-linecap="round"/><path d="M100 169h38M100 184h38" stroke="#eaf6ff" stroke-width="5" stroke-linecap="round"/>',
    frozen: '<rect x="57" y="124" width="186" height="94" rx="12" fill="#e6f6ff" stroke="#4384ad" stroke-width="8"/><path d="M57 153h186M91 124v94M207 124v94" stroke="#4384ad" stroke-width="6"/><path d="M150 57v52M124 83h52M132 65l36 36M168 65l-36 36" stroke="#1596d1" stroke-width="8" stroke-linecap="round"/><path d="m150 57 0-16M124 83l-15 0M176 83h15M132 65l-12-12M168 65l12-12M132 101l-12 12M168 101l12 12" stroke="#1596d1" stroke-width="6" stroke-linecap="round"/>',
    cement: '<path d="M74 113q0-16 16-16h120q16 0 16 16v110H74Z" fill="#e9edf0" stroke="#657786" stroke-width="8"/><path d="M74 142h152M74 195h152" stroke="#a6b2bc" stroke-width="6"/><path d="M110 97 126 75h48l16 22" fill="#d7e0e7" stroke="#657786" stroke-width="7" stroke-linejoin="round"/><rect x="117" y="151" width="66" height="29" rx="7" fill="#fff" stroke="#657786" stroke-width="5"/><path d="M128 165h44" stroke="#1596d1" stroke-width="6" stroke-linecap="round"/>',
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
  const [user, setUser] = useState<{id:string} | null>(null);
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
  const [passkeyMessage, setPasskeyMessage] = useState("");
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const [redirectAfterPasskey, setRedirectAfterPasskey] = useState(false);
  const [resetMode, setResetMode] = useState(false);
  const [draft, setDraft] = useState<CargoDraft>(initialDraft);
  const [cargoSpace, setCargoSpace] = useState<"نصف الشاحنة"|"شاحنة كاملة"|"حمولة جزئية أخرى">("شاحنة كاملة");
  const [publishMessage, setPublishMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [cargoSearch, setCargoSearch] = useState("");\n  const [selectedVehicleCategory, setSelectedVehicleCategory] = useState<string | null>(null);
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
      setUser(data.session?.user ? {id:data.session.user.id} : null);
    }).catch(() => {
      if (alive) setAuthMessage("تعذر الاتصال بخدمة تسجيل الدخول. تحقق من الاتصال ثم أعد المحاولة.");
    });
    const {data:{subscription}} = db.auth.onAuthStateChange((_event, session) => {
      // Clear any previous account's role before rendering the next auth state.
      setProfileRole(null);
      setProfileError("");
      setProfileLoading(Boolean(session?.user));
      setUser(session?.user ? {id:session.user.id} : null);
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

  useEffect(() => {
    if (!redirectAfterPasskey || !user || profileLoading || profileError) return;
    // Route the authenticated account to its actual workspace after its role is loaded.
    const destination = profileRole === "owner" ? "?page=publish#publish" : "?page=services";
    window.location.assign(destination);
    setRedirectAfterPasskey(false);
  }, [redirectAfterPasskey, user?.id, profileLoading, profileError, profileRole]);

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
  const visible = useMemo(() => {
    const term = cargoSearch.trim().toLocaleLowerCase("ar");
    return filterCargos(cargos, "", "", "")
      .filter(c => !selectedGoods || matchesGoodsCategory(c.goods_type, selectedGoods))
      .filter(c => !term || [c.title,c.origin_city,c.destination_city,c.goods_type,c.truck_type,c.weight_text]
        .some(value => String(value ?? "").toLocaleLowerCase("ar").includes(term)));
  }, [cargos, cargoSearch, selectedGoods]);

  async function submitAuth(event: FormEvent) {    event.preventDefault(); if (!db) return;    setBusy(true); setAuthMessage("");
    try {
      const result = authMode === "login"
        ? await db.auth.signInWithPassword({email:email.trim(),password})
        : await db.auth.signUp({email:email.trim(),password,options:{data:{full_name:fullName.trim()}}});
      if (result.error) throw result.error;
      setPassword("");
      setAuthMessage(authMode === "signup" && !result.data.session
        ? "تم إنشاء الحساب. تحقق من بريدك الإلكتروني إذا طُلب منك ذلك."
        : "تمت العملية بنجاح.");
    } catch (error) { setAuthMessage(authErrorMessage(error)); }
    finally { setBusy(false); }
  }

  async function signInWithPasskey() {
    if (!db) { setPasskeyMessage("خدمة الحسابات غير متاحة حالياً."); return; }
    if (!window.isSecureContext || !("credentials" in navigator) || !("PublicKeyCredential" in window)) {
      setPasskeyMessage("هذا المتصفح لا يدعم مفاتيح المرور هنا. افتح الموقع عبر HTTPS في متصفح حديث.");
      return;
    }
    setPasskeyBusy(true); setPasskeyMessage("");
    try {
      const { error } = await db.auth.signInWithPasskey();
      if (error) throw error;
      setPasskeyMessage("تم تسجيل الدخول بنجاح باستخدام مفتاح المرور.");
      setRedirectAfterPasskey(true);
    } catch (error) {
      setPasskeyMessage(passkeyErrorMessage(error));
    } finally { setPasskeyBusy(false); }
  }

  async function registerPasskey() {
    if (!db || !user) { setPasskeyMessage("سجّل الدخول أولاً قبل إضافة مفتاح المرور."); return; }
    if (!window.isSecureContext || !("credentials" in navigator) || !("PublicKeyCredential" in window)) {
      setPasskeyMessage("هذا المتصفح لا يدعم مفاتيح المرور هنا. افتح الموقع عبر HTTPS في متصفح حديث.");
      return;
    }
    setPasskeyBusy(true); setPasskeyMessage("");
    try {
      const { data, error } = await db.auth.registerPasskey();
      if (error) throw error;
      setPasskeyMessage(data?.id ? "تم تسجيل مفتاح المرور على هذا الجهاز بنجاح." : "اكتملت عملية تسجيل مفتاح المرور.");
    } catch (error) {
      setPasskeyMessage(passkeyErrorMessage(error));
    } finally { setPasskeyBusy(false); }
  }

  async function sendPasswordReset() {
    if (!db || !email.trim()) { setAuthMessage("أدخل بريدك الإلكتروني أولاً."); return; }
    setBusy(true); setAuthMessage("");
    try {
      const { error } = await db.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin + window.location.pathname });
      if (error) throw error;
      setAuthMessage("إذا كان البريد مسجلاً، فستصلك رسالة لإعادة تعيين كلمة المرور.");
    } catch (error) { setAuthMessage(authErrorMessage(error)); }
    finally { setBusy(false); }
  }

  async function submitCargo(event: FormEvent) {
    event.preventDefault(); setPublishMessage("");
    if (!user) { setPublishMessage("سجّل الدخول أولاً."); return; }
    if (!canPublishCargo(profileRole)) {
      setPublishMessage("هذا الحساب غير مفعّل لنشر الشحنات. يلزم تفعيل دور صاحب البضاعة من الإدارة.");
      return;
    }
    const normalizedDraft = normalizeCargoDraft({
      ...draft,
      notes: [`المساحة المطلوبة: ${cargoSpace}`, draft.notes?.trim()].filter(Boolean).join("\n")
    });
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
              {!resetMode && authMode === "login" && <button type="button" className="button button-outline" disabled={passkeyBusy || !db} onClick={()=>void signInWithPasskey()}>{passkeyBusy?"جارٍ التحقق…":"الدخول بالبصمة أو مفتاح المرور"}</button>}
              {passkeyMessage && <p className="form-message" role="status">{passkeyMessage}</p>}
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
                <label>وزن الحمولة التقريبي (كغ أو طن)<input inputMode="decimal" placeholder="مثلاً 1500 كغ أو 1.5 طن" value={draft.weight_text ?? ""} onChange={e=>setDraft({...draft,weight_text:e.target.value || null})}/><small className="muted">اكتب الوزن والوحدة بوضوح.</small></label>
                <fieldset className="cargo-space-field"><legend>كم مساحة تحتاج من الشاحنة؟</legend><div className="cargo-space-options"><label><input type="radio" name="cargo-space" checked={cargoSpace==="نصف الشاحنة"} onChange={()=>setCargoSpace("نصف الشاحنة")}/> نصف الشاحنة</label><label><input type="radio" name="cargo-space" checked={cargoSpace==="شاحنة كاملة"} onChange={()=>setCargoSpace("شاحنة كاملة")}/> شاحنة كاملة</label><label><input type="radio" name="cargo-space" checked={cargoSpace==="حمولة جزئية أخرى"} onChange={()=>setCargoSpace("حمولة جزئية أخرى")}/> حمولة جزئية أخرى</label></div></fieldset>
                <label>نوع المركبة<select required value={draft.truck_type} onChange={e=>setDraft({...draft,truck_type:e.target.value})}><option value="">اختر النوع</option>{TRUCK_TYPES.map(t=><option key={t}>{t}</option>)}<optgroup label="الحافلات">{BUS_TYPES.map(t=><option key={t}>{t}</option>)}</optgroup></select></label>
                <label>تاريخ النقل<input type="date" required min={todayLocal()} value={draft.loading_date} onChange={e=>setDraft({...draft,loading_date:e.target.value})}/></label>
                
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
        <section className="approved-entry-role-choice" aria-labelledby="entry-role-title">
          <div className="category-heading">
            <p className="eyebrow">ابدأ رحلتك مع Barkoul.ma</p>
            <h2 id="entry-role-title">كيف تريد استخدام المنصة؟</h2>
            <p>اختر الصفة المناسبة لك للانتقال مباشرة إلى الخدمات التي تحتاجها.</p>
          </div>
          <div className="hero-actions approved-role-actions">
            <a className="button button-primary approved-role-card" href="?page=services&role=driver">
              <strong>أنا سائق شاحنة</strong>
              <span>أبحث عن شحنات وفرص نقل مناسبة</span>
            </a>
            <a className="button button-light approved-role-card" href="?page=publish&role=owner#publish-account">
              <strong>أنا صاحب بضاعة</strong>
              <span>أنشر شحنتي وأبحث عن سائق لنقلها</span>
            </a>
          </div>
        </section>
        <div className="hero-actions" style={{justifyContent:"center",marginTop:12}}>
          <a className="button button-outline" href="#admin">🔐 غرفة المدير</a>
        </div>
        <section className="approved-entry-hero" aria-labelledby="entry-title">
          <div className="approved-entry-visual">
            <div className="approved-entry-map"><MoroccoMark/><span>شبكة نقل تربط مدن المغرب<small><a href="https://commons.wikimedia.org/wiki/File:Morocco_full_map.svg" target="_blank" rel="noreferrer">الخريطة: Vegeta228 · CC BY-SA 4.0</a></small></span></div>
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
              <button type="button" className="button button-outline" disabled={passkeyBusy || !db} onClick={()=>void registerPasskey()}>{passkeyBusy?"جارٍ التسجيل…":"تفعيل الدخول بالبصمة على هذا الجهاز"}</button>
              {passkeyMessage && <p className="form-message" role="status">{passkeyMessage}</p>}
              <a className="button button-primary" href="?page=services">الدخول إلى الموقع</a>
            </div> : <>
              <div className="approved-login-heading"><span aria-hidden="true">♙</span><h1 id="entry-account-title">{resetMode ? "استعادة كلمة المرور" : authMode === "login" ? "تسجيل الدخول" : "إنشاء حساب جديد"}</h1></div>
              <form className="approved-login-form" onSubmit={resetMode ? (e)=>{e.preventDefault();void sendPasswordReset();} : submitAuth}>
                {!resetMode && authMode === "signup" && <label>الاسم الكامل<input required maxLength={100} value={fullName} onChange={e=>setFullName(e.target.value)} autoComplete="name"/></label>}
                <label>البريد الإلكتروني<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" placeholder="البريد الإلكتروني"/></label>
                {!resetMode && <label>كلمة المرور<input type="password" minLength={6} required value={password} onChange={e=>setPassword(e.target.value)} autoComplete={authMode==="login"?"current-password":"new-password"} placeholder="كلمة المرور"/></label>}
                <button className="button button-primary approved-login-submit" disabled={busy || !db}>{busy?"جارٍ التنفيذ…":resetMode?"إرسال رابط الاستعادة":authMode==="login"?"دخول":"إنشاء حساب"}</button>
                {!resetMode && authMode === "login" && <button type="button" className="button button-outline" disabled={passkeyBusy || !db} onClick={()=>void signInWithPasskey()}>{passkeyBusy?"جارٍ التحقق…":"الدخول بالبصمة أو مفتاح المرور"}</button>}
                {passkeyMessage && <p className="form-message" role="status">{passkeyMessage}</p>}
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

  return <div className="app-shell">
    <header className="topbar home-topbar services-topbar approved-services-topbar">
      <a className="brand home-brand" href="./" aria-label="Barkoul.ma الصفحة الرئيسية"><BrandTruck/><span className="brand-word">Barkoul<span>.ma</span></span></a>
      <nav aria-label="التنقل"><a className="home-nav-link" href="./">الرئيسية</a><a className="home-nav-link" href="#search">أبحث عن شحنة</a><a className="account-entry" href={user ? "?page=publish#publish" : "?page=publish#publish-account"}>أنشر شحنة</a><a className="home-nav-link" href="#categories">أنواع المركبات</a><a className="home-nav-link" href="#footer">الدعم والمساعدة</a><a className="account-entry" href="#admin">غرفة المدير</a></nav>
    </header>
    <main>
      <section className="approved-services-hero">
        <div className="approved-services-hero-copy"><p className="home-kicker">منصتكم للنقل والشحن في المغرب</p><h1>Barkoul.ma</h1><h2>ربط أصحاب البضائع بسائقي الشاحنات</h2><div className="hero-actions"><a className="button button-primary" href={user ? "?page=publish#publish" : "?page=publish#publish-account"}>أنشر شحنة</a><a className="button button-light" href="#search">أبحث عن شحنة</a></div></div>
        <div className="approved-services-hero-photo"><img src="https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?auto=format&fit=crop&w=1100&q=90" alt="شاحنة نقل بضائع" fetchPriority="high"/><img src="https://images.unsplash.com/photo-1570125909232-eb263c188f7e?auto=format&fit=crop&w=700&q=85" alt="حافلة نقل" /></div>
      </section>
      <section className="driver-onboarding-panel" aria-labelledby="driver-onboarding-title">
        <div>
          <p className="eyebrow">مسار السائقين</p>
          <h2 id="driver-onboarding-title">هل تريد العمل كسائق على Barkoul.ma؟</h2>
          <p>أنشئ حسابك واطلب تفعيل صفة السائق لتتمكن من تقديم عروض النقل بعد استكمال التحقق المطلوب.</p>
        </div>
        <div className="driver-onboarding-action">
          {!user ? <a className="button button-primary" href="?page=publish#publish-account">الدخول أو إنشاء حساب</a> :
           profileLoading ? <span className="muted" role="status">جارٍ التحقق من الحساب…</span> :
           profileError ? <button type="button" className="button button-light" onClick={()=>void refreshProfileRole()}>إعادة التحقق من الحساب</button> :
           profileRole === "driver" ? <span className="driver-onboarding-status" role="status">حسابك مفعّل كسائق</span> :
           profileRole === "user" ? roleRequest?.status === "pending" && roleRequest.requested_role === "driver" ?
             <span className="driver-onboarding-status" role="status">طلب تفعيل السائق قيد المراجعة</span> :
             <button type="button" className="button button-primary" disabled={busy} onClick={()=>void submitRoleRequest("driver")}>طلب تفعيل حساب سائق</button> :
           <span className="muted">هذا المسار مخصص لحسابات السائقين.</span>}
          {roleRequestMessage && <p className="form-message" role="status">{roleRequestMessage}</p>}
        </div>
      </section>
      <section className="approved-search-panel" id="search"><div className="approved-search-actions"><a className="button button-primary" href={user ? "?page=publish#publish" : "?page=publish#publish-account"}>أنشر شحنة</a><a className="button button-light" href="#available-cargos">أبحث عن شحنة</a></div><p className="muted simple-search-hint">اضغط على «أبحث عن شحنة» لرؤية الشحنات، أو اكتب ما تبحث عنه في خانة البحث.</p></section>
      <section className="vehicle-category-section" id="categories" aria-label="فئات المركبات">
        <div className="category-heading"><p className="eyebrow">اختر نوع المركبة</p><h2>ماذا تبحث عنه؟</h2><p>اختر صورة واحدة لعرض الأنواع المتوفرة.</p></div>
        <div className="vehicle-category-grid">{VEHICLE_GROUPS.map(group=><button type="button" className={selectedVehicleCategory===group.key?"vehicle-category-card active":"vehicle-category-card"} key={group.key} onClick={()=>setSelectedVehicleCategory(selectedVehicleCategory===group.key?null:group.key)} aria-expanded={selectedVehicleCategory===group.key}><img src={group.image} alt="" loading="lazy"/><span>{group.title}</span><b aria-hidden="true">›</b></button>)}</div>
        {selectedVehicleCategory && <div className="vehicle-subtype-panel" aria-live="polite"><div className="vehicle-subtype-heading"><h3>{VEHICLE_GROUPS.find(group=>group.key===selectedVehicleCategory)?.title}</h3><button type="button" className="text-button" onClick={()=>setSelectedVehicleCategory(null)}>العودة للفئات</button></div><div className="vehicle-subtype-grid">{VEHICLE_GROUPS.find(group=>group.key===selectedVehicleCategory)?.types.map((type,index)=><button type="button" className="vehicle-subtype-card" key={type} onClick={()=>{setCargoSearch(type);document.getElementById("available-cargos")?.scrollIntoView({behavior:"smooth"});}}><span className="vehicle-subtype-icon" aria-hidden="true">{selectedVehicleCategory==="bus"?"▰":selectedVehicleCategory==="small"?"🚚":"🚛"}</span><strong>{type}</strong></button>)}</div></div>}
      </section>
      {!db && <div className="notice notice-warn">الاتصال بقاعدة البيانات غير مضبوط بعد. أضف متغيرات البيئة في إعدادات البناء قبل اختبار الحسابات والشحنات.</div>}
      <section className="section" id="available-cargos"><div className="section-heading"><div><p className="eyebrow">اكتشف الفرص</p><h2>الشحنات المتاحة</h2></div><button className="button button-outline" onClick={refresh} disabled={!db || loading}>تحديث</button></div>
        {selectedGoods && <p className="selected-category">التصنيف المختار: {selectedGoods} <button className="text-button" onClick={()=>setSelectedGoods("")}>إلغاء التصفية</button></p>}
        <div className="simple-cargo-search"><label htmlFor="cargo-search">ابحث عن شحنة<input id="cargo-search" type="search" value={cargoSearch} onChange={e=>setCargoSearch(e.target.value)} placeholder="مدينة، بضاعة، أو نوع المركبة…"/></label>{cargoSearch&&<button type="button" className="text-button" onClick={()=>setCargoSearch("")}>مسح البحث</button>}</div>
        {loading ? <p className="muted">جاري تحميل الشحنات…</p> : error ? <p className="notice notice-warn">{error}</p> : visible.length === 0 ? <p className="empty">لا توجد شحنات مطابقة حالياً.</p> :
          <div className="cargo-grid">{visible.map(c=>{const space=c.notes?.split(String.fromCharCode(10)).find(note=>note.startsWith("المساحة المطلوبة:"))?.replace("المساحة المطلوبة:","").trim();const publicNotes=c.notes?.split(String.fromCharCode(10)).filter(note=>!note.startsWith("المساحة المطلوبة:")).join(" ").trim();return <article className="cargo-card" key={c.id}><div className="cargo-card-top"><span className="tag">{c.truck_type}</span><span className="muted">{c.loading_date}</span></div><h3>{c.title}</h3><p className="route">{c.origin_city}<span>←</span>{c.destination_city}</p><div className="cargo-facts"><span>{c.goods_type}</span>{c.weight_text&&<span>{c.weight_text}</span>}{space&&<span>{space}</span>}</div><details className="cargo-details"><summary>عرض التفاصيل</summary><div><p><b>نوع المركبة:</b> {c.truck_type}</p><p><b>تاريخ النقل:</b> {c.loading_date}</p>{publicNotes&&<p><b>ملاحظات:</b> {publicNotes}</p>}</div></details></article>})}</div>}
      </section>
      {user && (profileRole === "owner" || profileRole === "driver") && <Workspace key={user.id} userId={user.id} role={profileRole} openCargos={cargos}/>}
    </main>
    <footer className="reference-footer" id="footer"><div className="social-links" aria-label="روابط التواصل"><a href="https://wa.me/" aria-label="واتساب">◉</a><a href="https://facebook.com/" aria-label="فيسبوك">f</a><a href="https://youtube.com/" aria-label="يوتيوب">▶</a><a href="https://linkedin.com/" aria-label="لينكدإن">in</a><a href="https://x.com/" aria-label="X">𝕏</a></div><strong>Barkoul.ma — نقل آمن، تجارتك في أمان</strong><p className="footer-contact"><span>فريق Barkoul.ma</span> · <span>سيتم إضافة بريد التواصل الرسمي بعد إنشائه</span></p></footer>
  </div>;

}