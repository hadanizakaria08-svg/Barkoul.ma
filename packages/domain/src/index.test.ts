import assert from "node:assert/strict";
import { describe, it } from "node:test";
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
    assert.deepEqual(validateCargoDraft(draft,"2026-11-18"), []);
  });
  it("rejects same origin and destination", () => {
    assert.ok(validateCargoDraft({...draft,destination_city:"الدار البيضاء"},"2026-11-18")
      .includes("مدينة الانطلاق والوصول يجب ألا تكونا متطابقتين."));
  });
  it("rejects a past date and negative price", () => {
    const errors=validateCargoDraft({...draft,loading_date:"2026-01-01",offered_price_mad:-5},"2026-11-18");
    assert.ok(errors.includes("تاريخ النقل لا يمكن أن يكون في الماضي."));
    assert.ok(errors.includes("السعر يجب أن يكون قيمة رقمية غير سالبة."));
  });
  it("accepts decimal MAD prices because the publishing form allows cents", () => {
    assert.deepEqual(validateCargoDraft({...draft,offered_price_mad:1200.5},"2026-11-18"), []);
  });
  it("rejects whitespace-only required fields", () => {
    const errors=validateCargoDraft({...draft,title:"   ",goods_type:"  "},"2026-11-18");
    assert.ok(errors.includes("عنوان الشحنة مطلوب."));
    assert.ok(errors.includes("نوع البضاعة مطلوب."));
  });
  it("filters routes without case sensitivity", () => {
    assert.deepEqual(filterCargos(cargos,"الدار البيضاء","مراكش","شاحنة كبيرة").map(c=>c.id), [1]);
  });
});
