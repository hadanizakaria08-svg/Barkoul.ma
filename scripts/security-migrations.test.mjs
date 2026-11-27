import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

const migration = await readFile(
  new URL("../supabase/migrations/20261120149000_lock_direct_mutations_and_atomic_cargo_cancel.sql", import.meta.url),
  "utf8"
);
const workspace = await readFile(new URL("../apps/web/src/Workspace.tsx", import.meta.url), "utf8");
const app = await readFile(new URL("../apps/web/src/App.tsx", import.meta.url), "utf8");
const dataLayer = await readFile(new URL("../packages/data/src/index.ts", import.meta.url), "utf8");
const rpcValidationMigration = await readFile(
  new URL("../supabase/migrations/20261120149500_validate_rpc_arguments.sql", import.meta.url),
  "utf8"
);
const atomicWorkflowMigration = await readFile(
  new URL("../supabase/migrations/20261120149700_atomic_negotiation_and_document_binding.sql", import.meta.url),
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

  it("limits anonymous cargo reads to public listing fields", () => {
    assert.equal(migration.includes("GRANT SELECT ON public.cargos TO anon, authenticated"), false);
    assert.ok(migration.includes("GRANT SELECT ON public.cargos TO authenticated"));
    assert.ok(migration.includes("GRANT SELECT ("));
    const grant = migration.split("GRANT SELECT (")[1]?.split(") ON public.cargos TO anon")[0] ?? "";
    assert.ok(grant.includes("title"));
    assert.ok(grant.includes("destination_city"));
    assert.equal(grant.includes("owner_id"), false);
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

  it("keeps delivery confirmation available when location permission is denied", () => {
    assert.ok(workspace.includes('progress(t,"in_transit")'));
    assert.ok(workspace.includes('progress(t,"in_transit",true)'));
    assert.ok(workspace.includes('progress(t,"delivered")'));
    assert.equal(workspace.includes('progress(t,"delivered",true)'), false);
  });

  it("routes the owner UI through the cancellation RPC instead of direct table UPDATE", () => {
    assert.ok(workspace.includes('db.rpc("cancel_open_cargo",{p_cargo_id:id})'));
    assert.equal(workspace.includes('from("cargos").update('), false);
  });

  it("keeps trips and administrative ledgers read-only to direct client mutations", () => {
    assert.ok(migration.includes("GRANT SELECT ON public.trips TO authenticated"));
    assert.ok(migration.includes("GRANT SELECT ON public.admin_users, public.admin_audit_log, public.commission_charges"));
    assert.ok(migration.includes("GRANT SELECT ON public.negotiations TO authenticated"));
    assert.ok(atomicWorkflowMigration.includes("REVOKE INSERT ON public.negotiations FROM PUBLIC, anon, authenticated"));
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

  it("creates offers through a server-verified RPC with a cargo row lock", () => {
    assert.ok(atomicWorkflowMigration.includes("CREATE OR REPLACE FUNCTION private.create_negotiation_impl"));
    assert.ok(atomicWorkflowMigration.includes("FROM public.cargos c"));
    assert.ok(atomicWorkflowMigration.includes("FOR UPDATE"));
    assert.ok(atomicWorkflowMigration.includes("p_proposed_price_mad <= 0"));
    assert.ok(atomicWorkflowMigration.includes("p_proposed_price_mad::text IN ('NaN','Infinity','-Infinity')"));
    assert.ok(atomicWorkflowMigration.includes("p.role='driver'"));
    assert.ok(atomicWorkflowMigration.includes("d.review_status='verified'"));
    assert.ok(atomicWorkflowMigration.includes("CREATE OR REPLACE FUNCTION public.create_negotiation"));
    assert.ok(workspace.includes('db.rpc("create_negotiation"'));
    assert.equal(workspace.includes('from("negotiations").insert('), false);
  });

  it("uses a consistent cargo-first lock order when accepting offers", () => {
    assert.ok(atomicWorkflowMigration.includes("FOR UPDATE OF c"));
    assert.ok(atomicWorkflowMigration.includes("FROM public.negotiations n"));
    assert.ok(atomicWorkflowMigration.includes("FOR UPDATE;"));
    assert.ok(atomicWorkflowMigration.includes("SET status='rejected'"));
    assert.ok(atomicWorkflowMigration.includes("SET status='matched'"));
  });

  it("binds driver-document rows to their own uploaded object and protects referenced files", () => {
    assert.ok(atomicWorkflowMigration.includes("storage_path LIKE ((SELECT auth.uid())::text || '/%')"));
    assert.ok(atomicWorkflowMigration.includes("o.bucket_id='driver-documents'"));
    assert.ok(atomicWorkflowMigration.includes("o.name=driver_documents.storage_path"));
    assert.ok(atomicWorkflowMigration.includes("d.review_status='verified'"));
    const deleteGuard = atomicWorkflowMigration.split("CREATE POLICY driver_documents_bucket_delete_guard")[1] ?? "";
    assert.ok(deleteGuard.includes("NOT EXISTS"));
    assert.ok(deleteGuard.includes("WHERE d.storage_path=storage.objects.name"));
    assert.ok(atomicWorkflowMigration.includes("CREATE POLICY driver_documents_bucket_delete_guard"));
    assert.ok(atomicWorkflowMigration.includes("AS RESTRICTIVE FOR SELECT TO authenticated"));
    assert.ok(atomicWorkflowMigration.includes("AS RESTRICTIVE FOR INSERT TO authenticated"));
    assert.ok(atomicWorkflowMigration.includes("AS RESTRICTIVE FOR ALL TO anon"));
    assert.ok(atomicWorkflowMigration.includes("AS RESTRICTIVE FOR UPDATE TO authenticated"));
    assert.ok(atomicWorkflowMigration.includes("AS RESTRICTIVE FOR DELETE TO authenticated"));
    assert.ok(atomicWorkflowMigration.includes("Only pending documents can be reviewed"));
    assert.ok(atomicWorkflowMigration.includes("v_current_status IS DISTINCT FROM 'pending'"));
  });
});

const adminRoom = await readFile(new URL("../apps/web/src/AdminRoom.tsx", import.meta.url), "utf8");

const driverUploadGuardMigration = await readFile(
  new URL("../supabase/migrations/20261121082000_restrict_driver_document_upload_role.sql", import.meta.url),
  "utf8"
);


describe("driver document content validation feedback", () => {
  it("shows the content-signature error returned by the file validator", () => {
    const validationBranch = workspace
      .split("const contentError=await validateDriverDocumentFileContent(file);")[1]
      ?.split("const {error:uploadError}")[0] ?? "";
    assert.ok(validationBranch.includes("if(contentError){setMessage(contentError);return;}"));
    assert.equal(validationBranch.includes("setMessage(fileError)"), false);
  });
});

describe("private driver-document upload boundary", () => {
  it("restricts uploads to the authenticated driver's own folder and driver role", () => {
    const policy = driverUploadGuardMigration.split("CREATE POLICY driver_documents_bucket_insert_guard")[1] ?? "";
    assert.ok(policy.includes("AS RESTRICTIVE"));
    assert.ok(policy.includes("FOR INSERT TO authenticated"));
    assert.ok(policy.includes("bucket_id <> 'driver-documents'"));
    assert.ok(policy.includes("(storage.foldername(name))[1] = (SELECT auth.uid())::text"));
    assert.ok(policy.includes("p.role = 'driver'"));
    // The first document must remain uploadable before an administrator verifies it.
    assert.equal(policy.includes("review_status"), false);
  });
});

const publicCargoVisibilityMigration = await readFile(
  new URL("../supabase/migrations/20261121100000_limit_public_cargo_column_visibility.sql", import.meta.url),
  "utf8"
);

describe("anonymous cargo field privacy", () => {
  it("removes owner UUID access and grants only public listing fields", () => {
    assert.ok(publicCargoVisibilityMigration.includes("REVOKE SELECT ON TABLE public.cargos FROM PUBLIC, anon"));
    assert.ok(publicCargoVisibilityMigration.includes("REVOKE SELECT (owner_id) ON TABLE public.cargos FROM PUBLIC, anon"));
    const grant = publicCargoVisibilityMigration.split("GRANT SELECT (")[1] ?? "";
    assert.ok(grant.includes("id,"));
    assert.ok(grant.includes("title,"));
    assert.ok(grant.includes("created_at"));
    assert.equal(grant.includes("owner_id"), false);
  });
});

describe("administrator document review access", () => {
  it("preserves administrator reads for private document previews", () => {
    const policy = atomicWorkflowMigration.split("CREATE POLICY driver_documents_bucket_select_guard")[1]?.split("DROP POLICY IF EXISTS driver_documents_bucket_insert_guard")[0] ?? "";
    assert.ok(policy.includes("(storage.foldername(name))[1]=(SELECT auth.uid())::text"));
    assert.ok(policy.includes("(SELECT private.is_admin())"));
  });

  it("creates short-lived document links only when an administrator requests one", () => {
    assert.ok(adminRoom.includes('createSignedUrl(path, 300)'));
    assert.ok(adminRoom.includes('createDocumentLink(d.id,d.storage_path)'));
    assert.equal(adminRoom.includes('Promise.all((docsRes.data??[]).map(async(d:any)=>{'), false);
    assert.ok(adminRoom.includes('referrerPolicy="no-referrer"'));
  });
});


describe("administrator session and signed document link lifecycle", () => {
  it("expires temporary document URLs before their five-minute server lifetime", () => {
    assert.ok(adminRoom.includes("SIGNED_DOCUMENT_URL_TTL_MS = 5 * 60 * 1000"));
    assert.ok(adminRoom.includes("SIGNED_DOCUMENT_URL_CLEAR_MS = SIGNED_DOCUMENT_URL_TTL_MS - 5000"));
    assert.ok(adminRoom.includes("window.setTimeout"));
    assert.ok(adminRoom.includes("window.clearTimeout"));
    assert.ok(adminRoom.includes("انتهت صلاحية الرابط المؤقت"));
    assert.ok(adminRoom.includes("old[id] !== data.signedUrl"));
  });

  it("clears administrator-only data and pending links when the account or role changes", () => {
    assert.ok(adminRoom.includes("adminSessionVersion.current += 1"));
    assert.ok(adminRoom.includes("clearDocumentLinkTimers()"));
    assert.ok(adminRoom.includes("setDocumentLinks({})"));
    assert.ok(adminRoom.includes("setRequests([])"));
    assert.ok(adminRoom.includes("setDocuments([])"));
    assert.ok(adminRoom.includes("setAudit([])"));
    assert.ok(adminRoom.includes("setAdminCargos([])"));
    assert.ok(adminRoom.includes("setCharges([])"));
    assert.ok(adminRoom.includes("isCurrentAdminSession(sessionVersion, expectedAdminUserId)"));
  });
});


describe("driver cargo availability synchronization", () => {
  it("filters cargos with pending or accepted offers from the driver's offer form", () => {
    assert.ok(workspace.includes("filterCargosWithoutPendingOffers(openCargos, offers)"));
    assert.ok(workspace.includes("availableCargos.map(c=><OfferCard"));
    assert.ok(workspace.includes("لا توجد شحنات جديدة متاحة لك حالياً"));
  });

  it("refreshes the public cargo list after offer acceptance, cancellation, or trip completion", () => {
    assert.ok(workspace.includes("await refreshAfterMutation(successMessage,refreshFailureMessage,accept)"));
    assert.ok(workspace.includes('status === "cancelled" || status === "delivered"'));
    assert.ok(app.includes("onRefreshCargos={refresh}"));
    assert.ok(workspace.includes('Promise.all([load(),onRefreshCargos()]).catch(()=>setMessage("تعذر تحديث بيانات الحساب والشحنات. حاول مجدداً."))'));
    assert.ok(workspace.includes('Promise.all([load(),onRefreshCargos()]).catch(()=>setMessage("تم إرسال العرض، لكن تعذر تحديث قائمة الشحنات."))'));
  });
});


describe("workspace mutation confirmation survives refresh failures", () => {
  it("keeps successful writes distinct from post-write refresh errors", () => {
    assert.ok(workspace.includes("async function refreshAfterMutation("));
    assert.ok(workspace.includes('await refreshAfterMutation("تم إلغاء الشحنة المفتوحة.","تم إلغاء الشحنة، لكن تعذر تحديث البيانات. اضغط تحديث البيانات.",true)'));
    assert.ok(workspace.includes('const successMessage=accept?"تم قبول العرض وإنشاء الرحلة رقم "+data+".":"تم رفض العرض."'));
    assert.ok(workspace.includes('await refreshAfterMutation(successMessage,refreshFailureMessage,accept)'));
    assert.ok(workspace.includes('تم رفع الوثيقة وإرسالها للمراجعة، لكن تعذر تحديث قائمة الوثائق.'));
    assert.ok(workspace.includes('تم تحديث حالة الرحلة، لكن تعذر تحديث البيانات.'));
  });
});


const cargoRefresh = app.split("async function refresh() {")[1]?.split("async function refreshProfileRole()")[0] ?? "";

describe("cargo publication session binding", () => {
  it("rechecks the authenticated identity after profile authorization and before inserting", () => {
    const publishBody = dataLayer.split("export async function publishCargo")[1]?.split("\\n}")[0] ?? "";
    const profileRead = publishBody.indexOf('db.from("profiles")');
    const identityRecheck = publishBody.indexOf("db.auth.getUser()", profileRead);
    const cargoInsert = publishBody.indexOf('db.from("cargos").insert');
    assert.ok(profileRead >= 0);
    assert.ok(identityRecheck > profileRead);
    assert.ok(cargoInsert > identityRecheck);
    assert.ok(publishBody.includes("expectedUserId: string"));
    assert.ok(publishBody.includes("data.user.id !== expectedUserId"));
    assert.ok(publishBody.includes("verifiedAuthData.user.id !== expectedUserId"));
    assert.ok(app.includes("publishCargo(normalizedDraft,user.id)"));
  });
});


describe("role and profile operations stay bound to the active account", () => {
  it("invalidates stale profile refreshes when the authenticated identity changes", () => {
    const refreshRole = app.split("async function refreshProfileRole()")[1]?.split("useEffect(() => {")[0] ?? "";
    const authCallback = app.split("db.auth.onAuthStateChange")[1]?.split("refresh();")[0] ?? "";
    assert.ok(app.includes("const currentUserId = useRef<string | null>(null)"));
    assert.ok(refreshRole.includes("const requestVersion = ++profileRefreshVersion.current"));
    assert.ok(refreshRole.includes("currentUserId.current !== expectedUserId"));
    assert.ok(authCallback.includes("currentUserId.current = nextUserId"));
    assert.ok(authCallback.includes("profileRefreshVersion.current += 1"));
  });

  it("checks the same authenticated user before and after creating a role request", () => {
    const requestBody = app.split("async function submitRoleRequest")[1]?.split("const visible =")[0] ?? "";
    const firstIdentityCheck = requestBody.indexOf("db.auth.getUser()");
    const insert = requestBody.indexOf('db.from("profile_role_requests").insert');
    const secondIdentityCheck = requestBody.lastIndexOf("db.auth.getUser()");
    assert.ok(firstIdentityCheck >= 0);
    assert.ok(insert > firstIdentityCheck);
    assert.ok(secondIdentityCheck > insert);
    assert.ok(requestBody.includes("authData.user.id !== expectedUserId"));
    assert.ok(requestBody.includes("verifiedAuthData.user.id !== expectedUserId"));
    assert.ok(requestBody.includes("currentUserId.current === expectedUserId"));
  });

  it("clears role-request state on account changes and ignores stale reads", () => {
    const requestEffect = app.split("const requestVersion = ++roleRequestVersion.current")[1]?.split("async function submitRoleRequest")[0] ?? "";
    const authCallback = app.split("db.auth.onAuthStateChange")[1]?.split("refresh();")[0] ?? "";
    assert.ok(authCallback.includes("roleRequestVersion.current += 1"));
    assert.ok(authCallback.includes("setRoleRequest(null)"));
    assert.ok(requestEffect.includes("requestVersion === roleRequestVersion.current"));
    assert.ok(requestEffect.includes("currentUserId.current === requestUserId"));
  });
});

describe("public cargo refresh ordering", () => {
  it("allows only the newest overlapping refresh to update cargo, error, and loading state", () => {
    assert.ok(app.includes("const cargoRefreshVersion = useRef(0)"));
    assert.ok(cargoRefresh.includes("const requestVersion = ++cargoRefreshVersion.current"));
    assert.ok(cargoRefresh.includes("if (requestVersion !== cargoRefreshVersion.current) return;"));
    assert.ok(cargoRefresh.includes("if (requestVersion === cargoRefreshVersion.current) {"));
    assert.ok(cargoRefresh.includes("if (requestVersion === cargoRefreshVersion.current) setLoading(false);"));
  });
});

describe("auth bootstrap ordering", () => {
  it("does not let a stale getSession result override a newer auth event", () => {
    const authEffect = app.split("let alive = true;")[1]?.split("refresh();")[0] ?? "";
    assert.ok(authEffect.includes("let authEventReceived = false;"));
    assert.ok(authEffect.includes("if (!alive || authEventReceived) return;"));
    assert.ok(authEffect.includes("if (alive && !authEventReceived)"));
    assert.ok(authEffect.includes("authEventReceived = true;"));
  });
});


describe("workspace account isolation", () => {
  it("remounts private workspace state when the authenticated user changes", () => {
    assert.ok(app.includes('<Workspace key={user.id} userId={user.id}'));
  });

  it("clears prior account data and invalidates older in-flight workspace reads", () => {
    assert.ok(workspace.includes("const loadVersion = useRef(0)"));
    assert.ok(workspace.includes("const requestVersion = ++loadVersion.current"));
    assert.ok(workspace.includes("requestVersion !== loadVersion.current"));
    assert.ok(workspace.includes("loadVersion.current += 1"));
    assert.ok(workspace.includes("setDocuments([])"));
    assert.ok(workspace.includes("setCharges([])"));
    assert.ok(workspace.includes("setContacts({})"));
    assert.ok(workspace.includes("setProfile({full_name:\"\",phone:\"\"})"));
  });
});


const concurrencyHarness = await readFile(
  new URL("../scripts/postgres-concurrency.test.mjs", import.meta.url),
  "utf8"
);

describe("PostgreSQL multi-session concurrency regression coverage", () => {
  it("uses independent sessions and waits for observable row-lock contention", () => {
    assert.ok(concurrencyHarness.includes("PGAPPNAME: applicationName"));
    assert.ok(concurrencyHarness.includes("wait_event_type"));
    assert.ok(concurrencyHarness.includes('activity.startsWith("Lock|")'));
  });

  it("covers competing acceptances, both acceptance/cancellation orderings, and duplicate payment", () => {
    for (const marker of [
      "testTwoAccepts",
      "testAcceptWinsCancellation",
      "testCancelWinsAcceptance",
      "testDuplicateCommissionPayment",
      "public.respond_to_negotiation",
      "public.cancel_open_cargo",
      "public.admin_record_commission_payment"
    ]) {
      assert.ok(concurrencyHarness.includes(marker), "missing concurrency scenario: " + marker);
    }
  });
});


describe("shared busy-operation lifecycle", () => {
  it("does not let the initial session lookup clear a later user action", () => {
    const bootstrap = app.split("db.auth.getSession()")[1]?.split("const {data:{subscription}}")[0] ?? "";
    assert.equal(bootstrap.includes("setBusy(false)"), false);
  });

  it("allows only the current operation to release shared busy state", () => {
    assert.ok(app.includes("const busyOperationVersion = useRef(0)"));
    assert.ok(app.includes('const busyOperationKind = useRef<"auth" | "reset" | "role" | "cargo" | null>(null)'));
    assert.ok(app.includes("function beginBusyOperation(kind:"));
    assert.ok(app.includes("if (version !== busyOperationVersion.current) return;"));
    assert.equal((app.match(/beginBusyOperation\("(?:auth|reset|role|cargo)"\)/g) ?? []).length, 4);
    assert.equal((app.match(/finishBusyOperation\(busyVersion\)/g) ?? []).length, 4);
  });

  it("invalidates role and cargo busy state on an authenticated identity change", () => {
    const authCallback = app.split("db.auth.onAuthStateChange")[1]?.split("refresh();")[0] ?? "";
    assert.ok(authCallback.includes('busyOperationKind.current === "role" || busyOperationKind.current === "cargo"'));
    assert.ok(authCallback.includes("busyOperationVersion.current += 1"));
    assert.ok(authCallback.includes("busyOperationKind.current = null"));
  });
});


describe("administrator actions are bound to the active admin session", () => {
  it("invalidates the prior admin identity synchronously during render", () => {
    assert.ok(adminRoom.includes('const activeAdminUserId = useRef<string | null>(null)'));
    assert.ok(adminRoom.includes('activeAdminUserId.current = user && profileRole === "admin" ? user.id : null;'));
    assert.ok(adminRoom.includes("isAdminSessionCurrent("));
  });

  it("checks the server-authenticated administrator before each administrative RPC", () => {
    const actions = [
      ["async function recordCommission", 'db.rpc("admin_record_commission_payment"'],
      ["async function reviewDocument", 'db.rpc("admin_review_driver_document"'],
      ["async function reviewRequest", 'db.rpc("admin_review_role_request"']
    ];
    for (const [start, rpc] of actions) {
      const body = adminRoom.split(start)[1]?.split("\n  }")[0] ?? "";
      const identityCheck = body.indexOf("db.auth.getUser()");
      const rpcCall = body.indexOf(rpc);
      assert.ok(identityCheck >= 0, start + " must verify the authenticated user");
      assert.ok(rpcCall > identityCheck, start + " must verify identity before its RPC");
      assert.ok(body.includes("if (!isCurrentAdminSession(sessionVersion, expectedAdminUserId)) return;"));
      assert.ok(body.includes("if (isCurrentAdminSession(sessionVersion, expectedAdminUserId)) setBusyId(null);"));
    }
  });

  it("guards admin reads and signed document links against stale sessions", () => {
    for (const marker of [
      "const loadRequests = useCallback",
      "const loadAdminData = useCallback",
      "async function createDocumentLink"
    ]) {
      const body = adminRoom.split(marker)[1]?.split("\n  }")[0] ?? "";
      assert.ok(body.includes("isCurrentAdminSession("), marker + " must use the session guard");
    }
  });
});
