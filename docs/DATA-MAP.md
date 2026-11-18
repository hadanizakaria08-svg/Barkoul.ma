# خريطة قاعدة بيانات Barkoul.ma

## الحالة
قيد المطابقة مع قاعدة البيانات الحية. هذه الوثيقة لا تنشئ جداول ولا تنفذ SQL.

## ما تأكد من مراجعات سابقة
- ظهرت الجداول: profiles, cargos, negotiations, trips, driver_documents, admin_users, admin_audit_log.
- RLS كان مفعلاً على جداول public التي راجعناها.
- يوجد trigger لحماية دور profile، ووظيفة is_admin() بصلاحية SECURITY DEFINER.
- شوهد اختلاف نوع cargos.id (bigint) عن negotiations.cargo_id وtrips.cargo_id (integer). لا يُجرى تعديل قبل التحقق من كل FK والبيانات.
- واجهة index.html الحالية تستخدم حقول cargos: id, title, origin_city, destination_city, goods_type, weight_text, truck_type, loading_date, offered_price_mad, notes, status, created_at وعمود owner_id عند الإدراج.

## مطلوب قبل اعتماد طبقة البيانات
1. جلب تعريف الأعمدة والأنواع والقيم الافتراضية والقيود لكل جدول.
2. جلب تعريفات FK الفعلية واتجاهاتها وأنواع الطرفين.
3. مراجعة كل RLS policies والـ grants والـ functions والـ triggers.
4. توثيق enums والحالات الفعلية، لا استنتاجها من الواجهة.
5. مطابقة عمليات التفاوض والرحلات والوثائق مع الجداول وسياسات الوصول.
6. توثيق Storage buckets والسياسات قبل رفع أي ملف.

## قرار السلامة
لا تُنفذ أي migration من هذا المستودع على الإنتاج حتى تكتمل المطابقة والمراجعة والاختبار على بيئة منفصلة وموافقة صاحب المشروع.
