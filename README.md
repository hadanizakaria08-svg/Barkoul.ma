# Barkoul.ma

منصة مغربية لربط أصحاب البضائع بسائقي الشاحنات.

## الحالة الحالية
- تطبيق React/TypeScript الموحد في `apps/web` منشور الآن على GitHub Pages بعد نجاح فحوصات main CI.
- واجهة الويب تشمل الشحنات والحسابات وطلبات الأدوار والعروض والرحلات ووثائق السائقين ولوحة الإدارة والعمولات.
- ملفات الواجهة القديمة `index.html` و`admin.html` محفوظة في المستودع، والنسخ السابقة داخل `backups/`؛ لا تُحذف قبل قرار صريح.
- بناء Android debug APK وبناء Windows portable executable نجحا في GitHub Actions. بناء iOS Simulator ما زال ينتظر runner.
- قاعدة Supabase الإنتاجية خضعت لتدقيق RLS والصلاحيات، واختبارات تكاملية محاكاة مع rollback.

## الروابط
- الموقع: https://hadanizakaria08-svg.github.io/Barkoul.ma/
- [تشغيل نشر React إلى GitHub Pages](https://github.com/hadanizakaria08-svg/Barkoul.ma/actions/runs/44755560624)
- [تشغيل بناء Android وWindows وiOS](https://github.com/hadanizakaria08-svg/Barkoul.ma/actions/runs/44754709956)

## تشغيل الواجهة محلياً
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
Android APK وWindows portable الحاليان حزم تحقق غير موقعة للإصدار النهائي. لا يوجد IPA أو MSI/NSIS موقّع حتى الآن. لا تعلن جاهزية المتاجر قبل التوقيع واختبار الأجهزة الفعلية.
