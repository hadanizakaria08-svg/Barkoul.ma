export type CargoStatus = "open" | "reserved" | "completed" | "cancelled";

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

export function normalizeSearch(value: string): string {
  return value.trim().toLocaleLowerCase("ar");
}

export function validateCargoDraft(draft: CargoDraft, today: string): string[] {
  const errors: string[] = [];
  if (!draft.title.trim()) errors.push("عنوان الشحنة مطلوب.");
  if (!draft.origin_city.trim()) errors.push("مدينة الانطلاق مطلوبة.");
  if (!draft.destination_city.trim()) errors.push("مدينة الوصول مطلوبة.");
  if (!draft.goods_type.trim()) errors.push("نوع البضاعة مطلوب.");
  if (!draft.truck_type.trim()) errors.push("نوع الشاحنة مطلوب.");
  if (!draft.loading_date) errors.push("تاريخ النقل مطلوب.");
  if (normalizeSearch(draft.origin_city) === normalizeSearch(draft.destination_city)) {
    errors.push("مدينة الانطلاق والوصول يجب ألا تكونا متطابقتين.");
  }
  if (draft.loading_date && draft.loading_date < today) {
    errors.push("تاريخ النقل لا يمكن أن يكون في الماضي.");
  }
  if (draft.offered_price_mad !== null &&
      (!Number.isFinite(draft.offered_price_mad) || draft.offered_price_mad < 0)) {
    errors.push("السعر يجب أن يكون رقماً صحيحاً غير سالب.");
  }
  if (draft.title.length > 120) errors.push("عنوان الشحنة أطول من الحد المسموح.");
  if (draft.origin_city.length > 100 || draft.destination_city.length > 100) {
    errors.push("اسم المدينة أطول من الحد المسموح.");
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
  return cargos.filter((cargo) =>
    (!o || normalizeSearch(cargo.origin_city).includes(o)) &&
    (!d || normalizeSearch(cargo.destination_city).includes(d)) &&
    (!truck || cargo.truck_type === truck)
  );
}
