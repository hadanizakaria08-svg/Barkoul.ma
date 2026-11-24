export type CargoStatus = "open" | "pending" | "matched" | "completed" | "cancelled";

export type ProfileRole = "user" | "driver" | "owner" | "admin";

/** Only owners and administrators may create cargo records under the current RLS model. */
export function canPublishCargo(role: string | null | undefined): boolean {
  return role === "owner" || role === "admin";
}

/**
 * A driver may propose a negotiation only while the cargo is open,
 * and never on their own cargo. This is a UI/domain rule; database RLS
 * and constraints remain the authoritative enforcement boundary.
 */
export function canProposeNegotiation(
  cargoStatus: string | null | undefined,
  cargoOwnerId: string | null | undefined,
  actorId: string | null | undefined
): boolean {
  return cargoStatus === "open" &&
    typeof cargoOwnerId === "string" && cargoOwnerId.length > 0 &&
    typeof actorId === "string" && actorId.length > 0 &&
    cargoOwnerId !== actorId;
}

export const TRUCK_TYPES = [
  "شاحنة كبيرة",
  "شاحنة متوسطة",
  "شاحنة صغيرة",
  "جرار ومقطورة",
  "شاحنة تبريد"
] as const;

export const BUS_TYPES = [
  "حافلة سياحية",
  "حافلة بين المدن",
  "حافلة النقل الحضري",
  "حافلة مدرسية",
  "حافلة نقل العمال",
  "حافلة صغيرة (ميني باص)"
] as const;

export const VEHICLE_TYPES = [...TRUCK_TYPES, ...BUS_TYPES] as const;

export interface Cargo {
  id: number;
  title: string;
  origin_city: string;
  destination_city: string;
  goods_type: string;
  weight_text: string | null;
  truck_type: string;
  loading_date: string;
  offered_price_mad: number | null;
  notes: string | null;
  status: CargoStatus;
  created_at: string;
  owner_id?: string;
}

export interface CargoDraft {
  title: string;
  origin_city: string;
  destination_city: string;
  goods_type: string;
  weight_text: string | null;
  truck_type: string;
  loading_date: string;
  offered_price_mad: number | null;
  notes: string | null;
}

export interface CargoInsertPayload extends CargoDraft {
  owner_id: string;
  status: "open";
}

/**
 * Build an allow-listed insert payload. Never spread caller-controlled objects
 * into a database write: extra runtime properties must not override ownership,
 * status, IDs, or database-managed fields.
 */
export function buildCargoInsertPayload(draft: CargoDraft, ownerId: string): CargoInsertPayload {
  return {
    title: draft.title,
    origin_city: draft.origin_city,
    destination_city: draft.destination_city,
    goods_type: draft.goods_type,
    weight_text: draft.weight_text,
    truck_type: draft.truck_type,
    loading_date: draft.loading_date,
    offered_price_mad: draft.offered_price_mad,
    notes: draft.notes,
    owner_id: ownerId,
    status: "open"
  };
}

export function normalizeSearch(value: string): string {
  return value.trim().toLocaleLowerCase("ar");
}

const GOODS_CATEGORY_TERMS: Record<string, string[]> = {
  "الخضر والفواكه": ["خضر", "خضروات", "فواكه", "فاكهة", "منتجات فلاحية"],
  "الحبوب والدقيق": ["حبوب", "قمح", "شعير", "دقيق", "طحين"],
  "الألبان ومشتقاتها": ["ألبان", "حليب", "لبن", "جبن", "زبدة"],
  "المواد المجمدة": ["مجمد", "مجمدات", "تجميد"],
  "الإسمنت": ["إسمنت", "اسمنت"],
  "الآجر والطوب": ["آجر", "اجر", "طوب", "طابوق"],
  "الحديد والمعادن": ["حديد", "معادن", "معدن", "صلب"],
  "الرمل والحصى": ["رمل", "حصى", "زلط"],
  "السيراميك": ["سيراميك", "زليج", "بلاط"],
  "الخشب": ["خشب", "أخشاب"],
  "الأثاث": ["أثاث", "اثاث", "موبيليا"],
  "الأجهزة المنزلية": ["أجهزة منزلية", "ثلاجة", "غسالة", "فرن"],
  "التجهيز والديكور": ["ديكور", "تجهيز", "أثاث مكتبي"],
  "السلع المعلبة": ["معلبات", "سلع معلبة", "مصبرات"],
  "الآلات الصناعية": ["آلات صناعية", "معدات صناعية", "آلة صناعية"],
  "الأقمشة والملابس": ["أقمشة", "ملابس", "ثياب", "نسيج"],
  "البلاستيك": ["بلاستيك", "لدائن"],
  "الورق والكرتون": ["ورق", "كرتون", "ورق مقوى"],
  "الإلكترونيات": ["إلكترونيات", "الكترونيات", "أجهزة إلكترونية"],
  "السيارات": ["سيارات", "سيارة", "مركبات"],
  "معدات الحفر": ["حفر", "حفارة", "معدات حفر", "جرافة"],
  "المعدات الفلاحية": ["معدات فلاحية", "جرار", "آلة فلاحية"],
  "الأنابيب والمعادن": ["أنابيب", "انابيب", "قنوات", "مواسير"],
  "المولدات": ["مولد", "مولدات", "مولد كهربائي"],
  "الحمولات الضخمة": ["حمولات ضخمة", "حمولة ضخمة", "معدات ثقيلة"]
};

function normalizeGoodsText(value: string): string {
  return normalizeSearch(value)
    .replace(/[أإآ]/g, "ا")
    .replace(/[ى]/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Match a cargo free-text goods type against a selectable catalogue category. */
export function matchesGoodsCategory(goodsType: string, category: string): boolean {
  const goods = normalizeGoodsText(goodsType);
  if (!goods || !category.trim()) return false;
  const terms = [category, ...(GOODS_CATEGORY_TERMS[category] ?? [])];
  return terms.some((term) => {
    const normalized = normalizeGoodsText(term);
    return normalized.length > 0 && (goods === normalized || goods.includes(normalized));
  });
}

export function normalizeCargoDraft(draft: CargoDraft): CargoDraft {
  return {
    ...draft,
    title: draft.title.trim(),
    origin_city: draft.origin_city.trim(),
    destination_city: draft.destination_city.trim(),
    goods_type: draft.goods_type.trim(),
    weight_text: draft.weight_text?.trim() || null,
    truck_type: draft.truck_type.trim(),
    loading_date: draft.loading_date.trim(),
    notes: draft.notes?.trim() || null
  };
}

function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function validateCargoDraft(draft: CargoDraft, today: string): string[] {
  const errors: string[] = [];
  if (!draft.title.trim()) errors.push("عنوان الشحنة مطلوب.");
  if (!draft.origin_city.trim()) errors.push("مدينة الانطلاق مطلوبة.");
  if (!draft.destination_city.trim()) errors.push("مدينة الوصول مطلوبة.");
  if (!draft.goods_type.trim()) errors.push("نوع البضاعة مطلوب.");
  if (!draft.truck_type.trim()) {
    errors.push("نوع المركبة مطلوب.");
  } else if (!(VEHICLE_TYPES as readonly string[]).includes(draft.truck_type.trim())) {
    errors.push("نوع المركبة غير مدعوم.");
  }
  if (!draft.loading_date) {
    errors.push("تاريخ النقل مطلوب.");
  } else if (!isValidIsoDate(draft.loading_date)) {
    errors.push("تاريخ النقل غير صالح.");
  } else if (draft.loading_date < today) {
    errors.push("تاريخ النقل لا يمكن أن يكون في الماضي.");
  }
  if (normalizeSearch(draft.origin_city) === normalizeSearch(draft.destination_city)) {
    errors.push("مدينة الانطلاق والوصول يجب ألا تكونا متطابقتين.");
  }
  if (draft.offered_price_mad !== null &&
      (!Number.isFinite(draft.offered_price_mad) || draft.offered_price_mad < 0)) {
    errors.push("السعر يجب أن يكون قيمة رقمية غير سالبة.");
  }
  if (draft.title.length > 120) errors.push("عنوان الشحنة أطول من الحد المسموح.");
  if (draft.origin_city.length > 100 || draft.destination_city.length > 100) {
    errors.push("اسم المدينة أطول من الحد المسموح.");
  }
  if (draft.goods_type.length > 100) errors.push("نوع البضاعة أطول من الحد المسموح.");
  if (draft.weight_text && draft.weight_text.length > 100) {
    errors.push("وصف الوزن أطول من الحد المسموح.");
  }
  if (draft.notes && draft.notes.length > 1000) errors.push("الملاحظات أطول من الحد المسموح.");
  return errors;
}

export function filterCargos(
  cargos: Cargo[],
  origin: string,
  destination: string,
  truck: string
): Cargo[] {
  const o = normalizeSearch(origin);
  const d = normalizeSearch(destination);
  const t = normalizeSearch(truck);
  return cargos.filter((cargo) =>
    (!o || normalizeSearch(cargo.origin_city).includes(o)) &&
    (!d || normalizeSearch(cargo.destination_city).includes(d)) &&
    (!t || normalizeSearch(cargo.truck_type) === t)
  );
}
