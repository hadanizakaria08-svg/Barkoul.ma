import assert from "node:assert/strict";
import { spawn } from "node:child_process";

const OWNER = "11111111-1111-4111-8111-111111111111";
const DRIVER_ONE = "22222222-2222-4222-8222-222222222222";
const DRIVER_TWO = "33333333-3333-4333-8333-333333333333";
const ADMIN = "55555555-5555-4555-8555-555555555555";
let sequence = 0;

function startPsql(sql, applicationName) {
  const child = spawn("psql", ["-X", "-v", "ON_ERROR_STOP=1", "-A", "-t", "-q"], {
    env: { ...process.env, PGAPPNAME: applicationName }
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8").on("data", chunk => { stdout += chunk; });
  child.stderr.setEncoding("utf8").on("data", chunk => { stderr += chunk; });
  const done = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", code => resolve({ code, stdout, stderr }));
  });
  child.stdin.end(sql);
  return { child, done };
}

async function query(sql) {
  const result = await startPsql(sql, "barkoul-fixture-" + (++sequence)).done;
  if (result.code !== 0) {
    throw new Error("PostgreSQL fixture query failed:\n" + result.stderr + "\n" + sql);
  }
  return result.stdout.trim();
}

function lastInteger(output, label) {
  const values = output.split(/\r?\n/).map(value => value.trim()).filter(Boolean);
  const value = Number(values.at(-1));
  assert.ok(Number.isSafeInteger(value) && value > 0, label + " did not return a positive integer: " + output);
  return value;
}

async function createCargo(label) {
  const sql = "INSERT INTO public.cargos(title,origin_city,destination_city,goods_type,truck_type,owner_id,status) " +
    "VALUES ('Concurrency " + label + "','Casablanca','Rabat','General','Large truck','" + OWNER + "','open') RETURNING id;";
  return lastInteger(await query(sql), "cargo creation");
}

async function createOffer(cargoId, driverId, price) {
  const sql = "BEGIN; SET LOCAL ROLE authenticated; " +
    "SELECT set_config('request.jwt.claim.sub','" + driverId + "',true); " +
    "SELECT public.create_negotiation(" + cargoId + "," + price + ",'concurrency test'); COMMIT;";
  return lastInteger(await query(sql), "offer creation");
}

async function callAs(userId, statement) {
  const sql = "BEGIN; SET LOCAL ROLE authenticated; " +
    "SELECT set_config('request.jwt.claim.sub','" + userId + "',true); " +
    statement + " COMMIT;";
  await query(sql);
}

async function waitForActivity(applicationName, predicate, description, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const sql = "SELECT COALESCE(wait_event_type,'') || '|' || COALESCE(query,'') " +
      "FROM pg_stat_activity WHERE application_name='" + applicationName +
      "' AND state='active' ORDER BY backend_start DESC LIMIT 1;";
    const activity = await query(sql);
    if (predicate(activity)) return;
    await new Promise(resolve => setTimeout(resolve, 40));
  }
  throw new Error("Timed out waiting for " + description + " (" + applicationName + ")");
}

async function runRace({ name, holderSql, contenderSql, expectedError }) {
  const holderName = "barkoul-" + name + "-holder";
  const contenderName = "barkoul-" + name + "-contender";
  const holder = startPsql(holderSql, holderName);
  let contender;
  try {
    await waitForActivity(holderName, activity => activity.includes("pg_sleep(2.5)"), "lock holder to enter its hold interval");
    contender = startPsql(contenderSql, contenderName);
    await waitForActivity(contenderName, activity => activity.startsWith("Lock|"), "contender to block on the same row");
    const results = await Promise.all([holder.done, contender.done]);
    const holderResult = results[0];
    const contenderResult = results[1];
    assert.equal(holderResult.code, 0, name + " lock holder failed:\n" + holderResult.stderr);
    assert.notEqual(contenderResult.code, 0, name + " contender unexpectedly succeeded");
    if (expectedError) {
      assert.match(contenderResult.stderr, expectedError, name + " contender failed for an unexpected reason");
    }
  } catch (error) {
    holder.child.kill("SIGTERM");
    if (contender) contender.child.kill("SIGTERM");
    await Promise.allSettled([holder.done, ...(contender ? [contender.done] : [])]);
    throw error;
  }
}

function ownerTransaction(cargoId, statement) {
  return "BEGIN; SELECT id FROM public.cargos WHERE id=" + cargoId + " FOR UPDATE; " +
    "SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','" + OWNER + "',true); " +
    "SELECT pg_sleep(2.5); " + statement + " COMMIT;";
}

function ownerCall(statement) {
  return "BEGIN; SET LOCAL ROLE authenticated; " +
    "SELECT set_config('request.jwt.claim.sub','" + OWNER + "',true); " +
    statement + " COMMIT;";
}

async function cargoState(cargoId) {
  const sql = "SELECT status || '|' || " +
    "(SELECT count(*)::text FROM public.trips t WHERE t.cargo_id=c.id AND t.status<>'cancelled') || '|' || " +
    "(SELECT count(*)::text FROM public.negotiations n WHERE n.cargo_id=c.id AND n.status='accepted') " +
    "FROM public.cargos c WHERE c.id=" + cargoId + ";";
  return (await query(sql)).split("|");
}

async function testTwoAccepts() {
  const cargoId = await createCargo("two-accepts");
  const offerOne = await createOffer(cargoId, DRIVER_ONE, 140);
  const offerTwo = await createOffer(cargoId, DRIVER_TWO, 145);
  await runRace({
    name: "two-accepts",
    holderSql: ownerTransaction(cargoId, "SELECT public.respond_to_negotiation(" + offerOne + ",true);"),
    contenderSql: ownerCall("SELECT public.respond_to_negotiation(" + offerTwo + ",true);"),
    expectedError: /This offer is no longer available|Offer state changed|Cargo state changed/
  });
  assert.deepEqual(await cargoState(cargoId), ["matched", "1", "1"]);
}

async function testAcceptWinsCancellation() {
  const cargoId = await createCargo("accept-wins-cancel");
  const offerId = await createOffer(cargoId, DRIVER_ONE, 155);
  await runRace({
    name: "accept-wins-cancel",
    holderSql: ownerTransaction(cargoId, "SELECT public.respond_to_negotiation(" + offerId + ",true);"),
    contenderSql: ownerCall("SELECT public.cancel_open_cargo(" + cargoId + ");"),
    expectedError: /Cargo|cancel|state|available/i
  });
  assert.deepEqual(await cargoState(cargoId), ["matched", "1", "1"]);
}

async function testCancelWinsAcceptance() {
  const cargoId = await createCargo("cancel-wins-accept");
  const offerId = await createOffer(cargoId, DRIVER_TWO, 160);
  await runRace({
    name: "cancel-wins-accept",
    holderSql: ownerTransaction(cargoId, "SELECT public.cancel_open_cargo(" + cargoId + ");"),
    contenderSql: ownerCall("SELECT public.respond_to_negotiation(" + offerId + ",true);"),
    expectedError: /no longer available|not open|state changed|cancel/i
  });
  assert.deepEqual(await cargoState(cargoId), ["cancelled", "0", "0"]);
}

async function testDuplicateCommissionPayment() {
  const cargoId = await createCargo("duplicate-payment");
  const offerId = await createOffer(cargoId, DRIVER_ONE, 175);
  const acceptSql = "BEGIN; SET LOCAL ROLE authenticated; " +
    "SELECT set_config('request.jwt.claim.sub','" + OWNER + "',true); " +
    "SELECT public.respond_to_negotiation(" + offerId + ",true); COMMIT;";
  const tripId = lastInteger(await query(acceptSql), "trip creation");

  await callAs(OWNER, "SELECT public.update_trip_progress(" + tripId + ",'loading',NULL,NULL);");
  await callAs(DRIVER_ONE, "SELECT public.update_trip_progress(" + tripId + ",'in_transit',NULL,NULL);");
  await callAs(DRIVER_ONE, "SELECT public.update_trip_progress(" + tripId + ",'delivered',NULL,NULL);");

  const chargeSql = "SELECT id FROM public.commission_charges WHERE trip_id=" + tripId +
    " AND payer_id='" + OWNER + "' AND status='due' ORDER BY id LIMIT 1;";
  const chargeId = lastInteger(await query(chargeSql), "due owner commission lookup");

  const holderSql = "BEGIN; SELECT id FROM public.commission_charges WHERE id=" + chargeId +
    " FOR UPDATE; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','" + ADMIN +
    "',true); SELECT pg_sleep(2.5); SELECT public.admin_record_commission_payment(" + chargeId + ",'cash',NULL); COMMIT;";
  const contenderSql = "BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','" +
    ADMIN + "',true); SELECT public.admin_record_commission_payment(" + chargeId + ",'cash',NULL); COMMIT;";
  await runRace({
    name: "duplicate-payment",
    holderSql,
    contenderSql,
    expectedError: /Charge unavailable/
  });

  const paymentSql = "SELECT status || '|' || (SELECT count(*)::text FROM public.admin_audit_log " +
    "WHERE action='commission_payment_recorded' AND target_table='commission_charges' AND target_id='" +
    chargeId + "') FROM public.commission_charges WHERE id=" + chargeId + ";";
  assert.equal(await query(paymentSql), "paid|1", "concurrent payment must persist once and create one audit event");
}

await testTwoAccepts();
console.log("PASS: two concurrent offer acceptances produce exactly one active trip.");
await testAcceptWinsCancellation();
console.log("PASS: acceptance wins a concurrent cancellation without creating inconsistent state.");
await testCancelWinsAcceptance();
console.log("PASS: cancellation wins a concurrent acceptance without creating a trip.");
await testDuplicateCommissionPayment();
console.log("PASS: concurrent commission payment is recorded once with one audit event.");
console.log("PostgreSQL multi-session concurrency tests passed.");
