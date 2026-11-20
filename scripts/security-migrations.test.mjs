import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

const migration = await readFile(
  new URL("../supabase/migrations/20261120149000_lock_direct_mutations_and_atomic_cargo_cancel.sql", import.meta.url),
  "utf8"
);
const workspace = await readFile(new URL("../apps/web/src/Workspace.tsx", import.meta.url), "utf8");

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
      assert.match(migration, new RegExp(`REVOKE ALL ON public\\.${table} FROM PUBLIC, anon, authenticated`));
    }
    assert.match(migration, /REVOKE INSERT \\(%1\\$I\\) ON TABLE %2\\$s/);
    assert.match(migration, /REVOKE UPDATE \\(%1\\$I\\) ON TABLE %2\\$s/);
  });

  it("keeps cargo publishing open-only and prevents direct updates or deletes", () => {
    assert.match(migration, /status = 'open'/);
    assert.match(migration, /DROP POLICY IF EXISTS cargos_secure_update/);
    assert.match(migration, /DROP POLICY IF EXISTS cargos_secure_delete/);
    assert.match(migration, /GRANT INSERT \\([\\s\\S]*?owner_id, status\\) ON public\\.cargos TO authenticated/);
  });

  it("implements owner-only cancellation under a row lock", () => {
    assert.match(migration, /CREATE OR REPLACE FUNCTION private\\.cancel_open_cargo_impl\\(p_cargo_id bigint\\)/);
    assert.match(migration, /SECURITY DEFINER[\\s\\S]*?SET search_path = ''/);
    assert.match(migration, /WHERE c\\.id = p_cargo_id[\\s\\S]*?FOR UPDATE/);
    assert.match(migration, /v_owner_id IS DISTINCT FROM v_uid/);
    assert.match(migration, /v_status IS DISTINCT FROM 'open'/);
    assert.match(migration, /CREATE OR REPLACE FUNCTION public\\.cancel_open_cargo\\(p_cargo_id bigint\\)[\\s\\S]*?SECURITY INVOKER/);
    assert.match(migration, /GRANT EXECUTE ON FUNCTION public\\.cancel_open_cargo\\(bigint\\) TO authenticated/);
  });

  it("routes the owner UI through the cancellation RPC instead of direct table UPDATE", () => {
    assert.match(workspace, /db\\.rpc\\("cancel_open_cargo",\\s*\\{\\s*p_cargo_id:\\s*id\\s*\\}\\)/);
    assert.doesNotMatch(workspace, /from\\("cargos"\\)\\.update\\(/);
  });

  it("keeps trips and administrative ledgers read-only to direct client mutations", () => {
    assert.match(migration, /GRANT SELECT ON public\\.trips TO authenticated/);
    assert.match(migration, /GRANT SELECT ON public\\.admin_users, public\\.admin_audit_log, public\\.commission_charges/);
    assert.match(migration, /GRANT INSERT \\([\\s\\S]*?cargo_id, proposer_id, proposed_price_mad, message, status\\)[\\s\\S]*?ON public\\.negotiations TO authenticated/);
  });
});
