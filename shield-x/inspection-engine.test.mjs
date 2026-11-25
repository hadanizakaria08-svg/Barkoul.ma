import test from "node:test";
import assert from "node:assert/strict";
import {
  inspectShieldRequest,
  redactShieldEvidence,
  ShieldEvidenceLedger
} from "./inspection-engine.mjs";

test("ordinary Arabic freight search and benign online parameter are not flagged", () => {
  const result = inspectShieldRequest({
    method: "GET",
    path: "/cargo/search?origin=Casablanca&destination=Marrakech"
  });
  assert.equal(result.accepted, true);
  assert.equal(result.severity, "normal");
  assert.deepEqual(result.findings, []);
  assert.equal(result.action, "observe-only");
  assert.deepEqual(inspectShieldRequest({ path: "/?status=online" }).findings, []);
});

test("SQL injection probe is detected without blocking", () => {
  const result = inspectShieldRequest({
    method: "POST",
    path: "/api/search",
    body: "' OR 1=1 --"
  });
  assert.equal(result.severity, "high");
  assert.equal(result.findings[0].ruleId, "SX-SQL-001");
  assert.equal(result.action, "observe-only");
  assert.equal("body" in result, false);
});

test("encoded path traversal is detected", () => {
  const result = inspectShieldRequest({ path: "/files/%2e%2e%2fetc%2fpasswd" });
  assert.ok(result.findings.some(item => item.ruleId === "SX-PATH-001"));
});

test("script and command injection probes are classified", () => {
  const xss = inspectShieldRequest({ path: "/?q=%3Cscript%3Ealert(1)%3C%2Fscript%3E" });
  const command = inspectShieldRequest({ method: "POST", path: "/submit", body: "x; whoami" });
  assert.ok(xss.findings.some(item => item.ruleId === "SX-XSS-001"));
  assert.ok(command.findings.some(item => item.ruleId === "SX-CMD-001"));
});

test("raw body is represented only by its length and never by content or digest", () => {
  const secretFixture = "synthetic-password=never-store-this";
  const result = inspectShieldRequest({ method: "POST", path: "/login", body: secretFixture });
  assert.equal(result.bodyLength, secretFixture.length);
  assert.equal("bodyDigest" in result, false);
  assert.equal(JSON.stringify(result).includes(secretFixture), false);
});

test("request size is bounded and truncation is visible", () => {
  const result = inspectShieldRequest({ path: "/" + "a".repeat(3000), body: "x".repeat(9000) });
  assert.equal(result.truncated, true);
  assert.equal(result.bodyLength, 8192);
});

test("invalid input shape is rejected safely", () => {
  assert.throws(() => inspectShieldRequest("GET /"), TypeError);
  assert.equal(inspectShieldRequest({ path: "http://[" }).accepted, false);
});

test("evidence redaction removes sensitive keys and omits nested values", () => {
  assert.deepEqual(redactShieldEvidence({
    event: "probe",
    phone: "+212600000000",
    authorization: "Bearer synthetic",
    nested: { secret: "x" }
  }), {
    event: "probe",
    phone: "[REDACTED]",
    authorization: "[REDACTED]",
    nested: "[OMITTED]"
  });
});

test("evidence ledger verifies order and detects modification", () => {
  const ledger = new ShieldEvidenceLedger();
  ledger.append({ event: "synthetic-probe", bodyDigest: "abc123" }, "2026-11-25T00:00:00.000Z");
  ledger.append({ event: "reviewed", severity: "high" }, "2026-11-25T00:00:01.000Z");
  const entries = ledger.export();
  assert.equal(ShieldEvidenceLedger.verify(entries), true);
  assert.equal(entries[0].event.bodyDigest, "[REDACTED]");
  entries[1].event.event = "modified";
  assert.equal(ShieldEvidenceLedger.verify(entries), false);
});

test("invalid evidence timestamps are rejected", () => {
  const ledger = new ShieldEvidenceLedger();
  assert.throws(() => ledger.append({ event: "test" }, "not-a-date"), TypeError);
});