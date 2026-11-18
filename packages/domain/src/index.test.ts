import { describe, expect, it } from "vitest";
import { filterCargos, validateCargoDraft, type Cargo, type CargoDraft } from "./index";

const draft: CargoDraft = {
  title: "نقل خضر", origin_city: "الدار البيضاء", destination_city: "مراكش",
  goods_type: "خضر", weight_text: "1000 كغ", truck_type: "شاحنة كبيرة",
  loading_date: "2027-01-10", offered_price_mad: 1200, notes: null
};

const cargos: Cargo[] = [
  {id:1,...draft,status:"open",created_at:"2026-11-18T10:00:00Z"},
  {id:2,...draft,origin_city:"طنجة",status:"open",created_at:"2026-11-18T11:00:00Z"}
];

describe("cargo domain rules", () => {
  it("accepts a valid future cargo", () => {
    expect(validateCargoDraft(draft,"2026-11-18")).toEqual([]);
  });
  it("rejects same origin and destination", () => {
    expect(validateCargoDraft({...draft,destination_city:"الدار البيضاء"},"2026-11-18"))
      .toContain("مدينة الانطلاق والوصول يجب ألا تكونا متطابقتين.");
  });
  it("rejects a past date and negative price", () => {
    const errors=validateCargoDraft({...draft,loading_date:"2026-01-01",offered_price_mad:-5},"2026-11-18");
    expect(errors).toContain("تاريخ النقل لا يمكن أن يكون في الماضي.");
    expect(errors).toContain("السعر يجب أن يكون رقماً صحيحاً غير سالب.");
  });
  it("accepts decimal MAD prices because the publishing form allows cents", () => {
    expect(validateCargoDraft({...draft,offered_price_mad:1200.5},"2026-11-18")).toEqual([]);
  });
  it("rejects whitespace-only required fields", () => {
    const errors=validateCargoDraft({...draft,title:"   ",goods_type:"  "},"2026-11-18");
    expect(errors).toContain("عنوان الشحنة مطلوب.");
    expect(errors).toContain("نوع البضاعة مطلوب.");
  });
  it("filters routes without case sensitivity", () => {
    expect(filterCargos(cargos,"الدار البيضاء","مراكش","شاحنة كبيرة").map(c=>c.id)).toEqual([1]);
  });
});