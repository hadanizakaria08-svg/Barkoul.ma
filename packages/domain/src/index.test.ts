import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildCargoInsertPayload,
  canProposeNegotiation,
  canPublishCargo,
  filterCargos,
  filterCargosWithoutPendingOffers,
  normalizeCargoDraft,
  validateCargoDraft,
  validateDriverDocumentFile,
  validateDriverDocumentFileContent,
  DRIVER_DOCUMENT_MAX_BYTES,
  type Cargo,
  type CargoDraft
} from "./index";

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
  it("allows publishing only for owner and admin profiles", () => {
    assert.equal(canPublishCargo("owner"), true);
    assert.equal(canPublishCargo("admin"), true);
    assert.equal(canPublishCargo("user"), false);
    assert.equal(canPublishCargo("driver"), false);
    assert.equal(canPublishCargo(null), false);
    assert.equal(canPublishCargo("unknown"), false);
  });

  it("accepts a valid future cargo", () => {
    assert.deepEqual(validateCargoDraft(draft,"2026-11-18"), []);
  });

  it("allows a different authenticated user to propose on an open cargo", () => {
    assert.equal(canProposeNegotiation("open", "owner-1", "driver-1"), true);
  });

  it("blocks negotiation on closed cargo or by its own owner", () => {
    assert.equal(canProposeNegotiation("reserved", "owner-1", "driver-1"), false);
    assert.equal(canProposeNegotiation("completed", "owner-1", "driver-1"), false);
    assert.equal(canProposeNegotiation("open", "owner-1", "owner-1"), false);
  });

  it("fails closed when cargo ownership or actor identity is missing", () => {
    assert.equal(canProposeNegotiation("open", null, "driver-1"), false);
    assert.equal(canProposeNegotiation("open", "owner-1", null), false);
    assert.equal(canProposeNegotiation("open", "", "driver-1"), false);
    assert.equal(canProposeNegotiation("open", "owner-1", ""), false);
  });

  it("creates a strict cargo insert payload and ignores unexpected caller fields", () => {
    const untrusted = {
      ...draft,
      owner_id: "attacker-id",
      status: "completed",
      id: 999,
      created_at: "2000-01-01T00:00:00Z"
    } as CargoDraft;
    assert.deepEqual(buildCargoInsertPayload(untrusted, "verified-user-id"), {
      ...draft,
      owner_id: "verified-user-id",
      status: "open"
    });
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

  it("rejects impossible calendar dates and non-ISO date strings", () => {
    assert.ok(validateCargoDraft({...draft,loading_date:"2027-02-30"},"2026-11-18")
      .includes("تاريخ النقل غير صالح."));
    assert.ok(validateCargoDraft({...draft,loading_date:"10/01/2027"},"2026-11-18")
      .includes("تاريخ النقل غير صالح."));
  });

  it("rejects truck categories outside the supported list", () => {
    assert.ok(validateCargoDraft({...draft,truck_type:"سيارة خاصة"},"2026-11-18")
      .includes("نوع الشاحنة غير مدعوم."));
  });

  it("normalizes surrounding whitespace and empty optional values before saving", () => {
    assert.deepEqual(normalizeCargoDraft({
      ...draft,
      title:"  نقل خضر  ",
      origin_city:" الدار البيضاء ",
      weight_text:"   ",
      notes:"  ملاحظة  "
    }), {
      ...draft,
      title:"نقل خضر",
      origin_city:"الدار البيضاء",
      weight_text:null,
      notes:"ملاحظة"
    });
  });

  it("filters truck categories after trimming search input", () => {
    assert.deepEqual(filterCargos(cargos,"","","  شاحنة كبيرة  ").map(c=>c.id), [1,2]);
  });

  it("hides cargos with pending or accepted offers but allows retry after rejection", () => {
    const active = filterCargosWithoutPendingOffers(cargos, [
      { cargo_id: 1, status: "pending" },
      { cargo_id: 2, status: "accepted" }
    ]);
    assert.deepEqual(active, []);

    const afterRejection = filterCargosWithoutPendingOffers(cargos, [
      { cargo_id: 1, status: "rejected" }
    ]);
    assert.deepEqual(afterRejection.map((cargo) => cargo.id), [1, 2]);
  });
});

describe("driver document validation", () => {
  it("accepts supported non-empty files within the 10 MB limit", () => {
    assert.equal(validateDriverDocumentFile({ type: "application/pdf", size: 1024 }), null);
    assert.equal(validateDriverDocumentFile({ type: "image/jpeg", size: DRIVER_DOCUMENT_MAX_BYTES }), null);
    assert.equal(validateDriverDocumentFile({ type: "image/png", size: 2048 }), null);
    assert.equal(validateDriverDocumentFile({ type: "image/webp", size: 2048 }), null);
  });

  it("rejects empty, oversized, unsupported, and invalid-size files", () => {
    assert.match(validateDriverDocumentFile({ type: "application/pdf", size: 0 }) ?? "", /فارغ/);
    assert.match(validateDriverDocumentFile({ type: "application/pdf", size: DRIVER_DOCUMENT_MAX_BYTES + 1 }) ?? "", /10 ميغابايت/);
    assert.match(validateDriverDocumentFile({ type: "image/heic", size: 1024 }) ?? "", /غير مدعوم/);
    assert.match(validateDriverDocumentFile({ type: "image/png", size: Number.NaN }) ?? "", /غير صالح/);
  });
  it("accepts files whose leading signatures match their declared MIME types", async () => {
    const makeFile = (type: string, bytes: number[]) => ({
      type,
      size: bytes.length,
      slice: () => ({ arrayBuffer: async () => Uint8Array.from(bytes).buffer as ArrayBuffer })
    });
    assert.equal(await validateDriverDocumentFileContent(makeFile("application/pdf", [0x25,0x50,0x44,0x46,0x2d,0x31])), null);
    assert.equal(await validateDriverDocumentFileContent(makeFile("image/jpeg", [0xff,0xd8,0xff,0x00])), null);
    assert.equal(await validateDriverDocumentFileContent(makeFile("image/png", [0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])), null);
    assert.equal(await validateDriverDocumentFileContent(makeFile("image/webp", [0x52,0x49,0x46,0x46,0,0,0,0,0x57,0x45,0x42,0x50])), null);
  });

  it("rejects MIME spoofing and unreadable file content", async () => {
    const spoofed = {
      type: "application/pdf",
      size: 8,
      slice: () => ({ arrayBuffer: async () => Uint8Array.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]).buffer as ArrayBuffer })
    };
    const unreadable = {
      type: "image/jpeg",
      size: 8,
      slice: () => ({ arrayBuffer: async () => { throw new Error("read failed"); } })
    };
    assert.match(await validateDriverDocumentFileContent(spoofed) ?? "", /لا يطابق/);
    assert.match(await validateDriverDocumentFileContent(unreadable) ?? "", /تعذر قراءة/);
  });

});
