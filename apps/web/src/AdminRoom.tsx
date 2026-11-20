import type { ProfileRole } from "@barkoul/domain";

interface AdminRoomProps {
  user: { id: string; email?: string } | null;
  profileRole: ProfileRole | null;
  profileLoading: boolean;
  profileError: string;
  onRefreshRole: () => void;
  onSignOut: () => void;
}

const sections = [
  { title: "إدارة الحسابات", description: "مراجعة الحسابات والأدوار وتفعيل أصحاب البضائع والسائقين", icon: "👥" },
  { title: "إدارة الشحنات", description: "مراجعة الشحنات والبلاغات وحالات النشر", icon: "🚚" },
  { title: "التحقق من السائقين", description: "مراجعة وثائق السائقين وطلبات التحقق", icon: "🪪" },
  { title: "المفاوضات والرحلات", description: "متابعة العروض والاتفاقات والرحلات", icon: "🧾" },
  { title: "سجل التدقيق", description: "مراجعة الأحداث الإدارية والأمنية", icon: "🛡️" },
  { title: "العمولات والتحصيل", description: "متابعة العمولات بعد اعتماد آلية الدفع", icon: "💳" }
];

export default function AdminRoom({
  user,
  profileRole,
  profileLoading,
  profileError,
  onRefreshRole,
  onSignOut
}: AdminRoomProps) {
  const homeLink = <a className="button button-light" href="#">العودة إلى المنصة</a>;

  if (!user) {
    return <main className="admin-gate" dir="rtl">
      <section className="admin-gate-card">
        <div className="admin-lock" aria-hidden="true">🔒</div>
        <p className="eyebrow">منطقة محمية</p>
        <h1>غرفة المدير</h1>
        <p>هذه المنطقة خاصة بحسابات الإدارة المصرّح لها فقط. سجّل الدخول أولاً، ثم ستُفحص صلاحية حسابك من قاعدة البيانات.</p>
        <div className="admin-gate-actions">{homeLink}<a className="button button-primary" href="./#account">تسجيل الدخول</a></div>
      </section>
    </main>;
  }

  if (profileLoading) {
    return <main className="admin-gate" dir="rtl">
      <section className="admin-gate-card" aria-live="polite">
        <div className="admin-lock" aria-hidden="true">⏳</div>
        <h1>جارٍ التحقق من صلاحية المدير</h1>
        <p>لن تظهر لوحة الإدارة قبل اكتمال التحقق.</p>
      </section>
    </main>;
  }

  if (profileError) {
    return <main className="admin-gate" dir="rtl">
      <section className="admin-gate-card" role="alert">
        <div className="admin-lock" aria-hidden="true">⚠️</div>
        <h1>تعذر التحقق من الصلاحية</h1>
        <p>تم إيقاف الوصول إلى غرفة المدير احتياطياً. أعد المحاولة بعد التأكد من الاتصال.</p>
        <div className="admin-gate-actions">
          <button className="button button-primary" onClick={onRefreshRole}>إعادة التحقق</button>
          {homeLink}
        </div>
      </section>
    </main>;
  }

  if (profileRole !== "admin") {
    return <main className="admin-gate" dir="rtl">
      <section className="admin-gate-card" role="alert">
        <div className="admin-lock" aria-hidden="true">⛔</div>
        <p className="eyebrow">وصول مرفوض</p>
        <h1>هذه الغرفة للمدير فقط</h1>
        <p>حسابك لا يحمل صلاحية المدير. لم يتم تحميل أي بيانات إدارية.</p>
        <div className="admin-gate-actions">{homeLink}</div>
      </section>
    </main>;
  }

  return <div className="admin-shell" dir="rtl">
    <header className="admin-topbar">
      <a className="brand" href="#">Barkoul<span>.ma</span></a>
      <div className="admin-topbar-actions">
        <span className="admin-session"><span className="admin-session-dot" /> جلسة مدير موثقة</span>
        {homeLink}
        <button className="button button-outline" onClick={onSignOut}>تسجيل الخروج</button>
      </div>
    </header>
    <main className="admin-main">
      <section className="admin-welcome">
        <p className="eyebrow">مساحة الإدارة الخاصة</p>
        <h1>غرفة المدير</h1>
        <p>مركز مراقبة Barkoul.ma وإدارة العمليات والصلاحيات.</p>
      </section>
      <section className="admin-security-note" role="status">
        <strong>حماية مفعّلة على مستوى الواجهة</strong>
        <p>تُعرض هذه الغرفة بعد التحقق من دور admin من ملف الحساب. أما قراءة البيانات وتغييرها فستظل محكومة بسياسات RLS وصلاحيات قاعدة البيانات، ولن نفعّل أي إجراء إداري قبل مطابقة مخطط الجداول والسياسات واختباره.</p>
      </section>
      <section className="admin-section">
        <div className="section-heading"><div><p className="eyebrow">أقسام الإدارة</p><h2>مركز التحكم</h2></div></div>
        <div className="admin-grid">
          {sections.map((section) => <article className="admin-card" key={section.title}>
            <span className="admin-card-icon" aria-hidden="true">{section.icon}</span>
            <h2>{section.title}</h2>
            <p>{section.description}</p>
            <span className="admin-pending">بانتظار ربط آمن بالبيانات</span>
          </article>)}
        </div>
      </section>
      <p className="admin-footnote">لا توجد حالياً أزرار حذف أو تعديل أو ترقية حسابات في هذه النسخة؛ لن تُنفّذ عمليات إدارية غير موثقة.</p>
    </main>
  </div>;
}
