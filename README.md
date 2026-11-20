# Barkoul.ma

منصة مغربية لربط أصحاب البضائع بسائقي الشاحنات.

## الحالة الحالية
- واجهة الموقع الحالية `index.html` ولوحة الإدارة `admin.html` تم تحديثهما ونشرهما عبر GitHub Pages.
- النسخ السابقة محفوظة داخل `backups/`.
- تطبيق React/TypeScript الموحد موجود في `apps/web` داخل `main`، لكنه لم يُستبدل به جذر الموقع بعد؛ نشره كواجهة الويب الرئيسية يحتاج تشغيل سير النشر المخصص وضبط مصدر Pages على GitHub Actions.
- قاعدة Supabase الإنتاجية خضعت لتدقيق RLS والصلاحيات، واختبارات تكاملية محاكاة مع rollback.
- سير بناء Android وiOS وWindows موجود في GitHub Actions؛ حزمة Android debug بُنيت بنجاح، وحزم التحقق الأخرى قيد الفحص.

## المتطلبات
- Node.js 20+
- npm 10+

## تشغيل الواجهة
1. انسخ `.env.example` إلى `.env`.
2. ضع Supabase URL ومفتاح Publishable/anon العام فقط في متغيرات البيئة.
3. شغّل `npm install`.
4. شغّل `npm run dev`.

## الفحوصات
- `npm run typecheck`
- `npm test`
- `npm run build`
- `npm run test:e2e`
- `npm run check:legacy-html`

## الأمان
لا تضع مفتاح `service_role` أو أي سر في الواجهة أو المستودع. يعتمد الوصول على RLS والتحقق عبر RPCs. تغييرات قاعدة البيانات يجب أن تكون عبر migrations مراجعة ومختبرة.

## المنصات
الويب الحالي منشور كواجهة HTML مستقرة. React/TypeScript هو التطبيق الموحد قيد الإعداد للنشر متعدد المنصات. حزم Android/iOS/Windows الحالية حزم تحقق غير موقعة وليست إصدارات متاجر.
