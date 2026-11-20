import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

const migration = await readFile(
  new URL("../supabase/migrations/20261120149000_lock_direct_mutations_and_atomic_cargo_cancel.sql", import.meta.url),
  "utf8"
);
const workspace = await readFile(new URL("../apps/web/src/Workspace.tsx", import.meta.url), "utf8");
const rpcValidationMigration = await readFile(
  new URL("../supabase/migrations/20261120149500_validate_rpc_arguments.sql", import.meta.url),
  "utf8"
);

describe("database mutation boundaries", () => {
  it("removes direct table grants before restoring least-privilege access", () => {
    for (const table of [
      "profiles",
      "cargos",
      "negotiations",
      "trips",
      "driver_documents",
      "profile_role_requests",
      "admin_users",
      "admin_audit_log",
      "commission_charges"
    ]) {
      assert.ok(
        migration.includes(`REVOKE ALL ON public.${table} FROM PUBLIC, anon, authenticated`),
        `missing privilege reset for ${table}`
      );
    }
    assert.ok(migration.includes("REVOKE INSERT (%1$I) ON TABLE %2$s"));
    assert.ok(migration.includes("REVOKE UPDATE (%1$I) ON TABLE %2$s"));
  });

  it("keeps cargo publishing open-only and prevents direct updates or deletes", () => {
    assert.ok(migration.includes("status = 'open'"));
    assert.ok(migration.includes("DROP POLICY IF EXISTS cargos_secure_update"));
    assert.ok(migration.includes("DROP POLICY IF EXISTS cargos_secure_delete"));
    assert.ok(migration.includes("title, origin_city, destination_city, goods_type, weight_text"));
    assert.ok(migration.includes("notes, owner_id, status"));
  });

  it("implements owner-only cancellation under a row lock", () => {
    assert.ok(migration.includes("CREATE OR REPLACE FUNCTION private.cancel_open_cargo_impl(p_cargo_id bigint)"));
    assert.ok(migration.includes("SECURITY DEFINER"));
    assert.ok(migration.includes("SET search_path = ''"));
    assert.ok(migration.includes("WHERE c.id = p_cargo_id"));
    assert.ok(migration.includes("FOR UPDATE"));
    assert.ok(migration.includes("v_owner_id IS DISTINCT FROM v_uid"));
    assert.ok(migration.includes("v_status IS DISTINCT FROM 'open'"));
    assert.ok(migration.includes("CREATE OR REPLACE FUNCTION public.cancel_open_cargo(p_cargo_id bigint)"));
    assert.ok(migration.includes("SECURITY INVOKER"));
    assert.ok(migration.includes("GRANT EXECUTE ON FUNCTION public.cancel_open_cargo(bigint) TO authenticated"));
  });

  it("routes the owner UI through the cancellation RPC instead of direct table UPDATE", () => {
    assert.ok(workspace.includes('db.rpc("cancel_open_cargo",{p_cargo_id:id})'));
    assert.equal(workspace.includes('from("cargos").update('), false);
  });

  it("keeps trips and administrative ledgers read-only to direct client mutations", () => {
    assert.ok(migration.includes("GRANT SELECT ON public.trips TO authenticated"));
    assert.ok(migration.includes("GRANT SELECT ON public.admin_users, public.admin_audit_log, public.commission_charges"));
    assert.ok(migration.includes("cargo_id, proposer_id, proposed_price_mad, message, status"));
    assert.ok(migration.includes("ON public.negotiations TO authenticated"));
  });

  it("rejects null and unsupported arguments at sensitive RPC boundaries", () => {
    for (const signature of [
      "public.respond_to_negotiation",
      "public.update_trip_progress",
      "public.admin_set_profile_role",
      "public.admin_review_role_request",
      "public.admin_review_driver_document",
      "public.admin_record_commission_payment"
    ]) {
      assert.ok(rpcValidationMigration.includes(`CREATE OR REPLACE FUNCTION ${signature}`));
    }
    assert.ok(rpcValidationMigration.includes("p_negotiation_id IS NULL OR p_accept IS NULL"));
    assert.ok(rpcValidationMigration.includes("p_status NOT IN ('loading','in_transit','delivered','cancelled')"));
    assert.ok(rpcValidationMigration.includes("p_method NOT IN ('cash','electronic')"));
    assert.ok(rpcValidationMigration.includes("p_approve IS NULL"));
  });
});
