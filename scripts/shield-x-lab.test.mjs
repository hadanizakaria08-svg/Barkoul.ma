import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSensorSummary,
  classifyShieldSignal,
  createPhantomSnapshot,
  EvidenceChain,
  phantomFlashMessage,
  redactEvidence
} from "./shield-x-lab.mjs";

test("Phantom Room rotates synthetic records once per second and stays deterministic within a second", () => {
  const first = createPhantomSnapshot(1_700_000_000_100);
  const sameSecond = createPhantomSnapshot(1_700_000_000_900);
  const nextSecond = createPhantomSnapshot(1_700_000_001_000);
  assert.deepEqual(first, sameSecond);
  assert.notEqual(first.generation, nextSecond.generation);
  assert.equal(first.labOnly, true);
  assert.match(first.apiSurface.host, /\.phantom\.invalid$/);
  assert.match(first.apiSurface.token, /^DECOY-TOKEN-/);
});

test("Shield signal classification only reports observations and never enforces", () => {
  assert.equal(classifyShieldSignal({ payload: "hello" }).severity, "normal");
  const result = classifyShieldSignal({ payload: "' OR 1=1 --" });
  assert.equal(result.severity, "elevated");
  assert.equal(result.chameleonColor, "amber");
  assert.equal(result.action, "observe-only");
});

test("evidence chain verifies and detects tampering", () => {
  const chain = new EvidenceChain();
  chain.append({ event: "synthetic-probe", token: "should-not-be-kept" }, "2026-11-20T00:00:00.000Z");
  chain.append({ event: "decoy-visited", result: true }, "2026-11-20T00:00:01.000Z");
  const entries = chain.export();
  assert.equal(EvidenceChain.verify(entries), true);
  assert.equal(entries[0].event.token, "[REDACTED]");
  entries[1].event.event = "rewritten";
  assert.equal(EvidenceChain.verify(entries), false);
});

test("evidence redaction removes sensitive fields", () => {
  assert.deepEqual(redactEvidence({ username: "lab-user", password: "x", authorization: "Bearer x", phone: "+212" }), {
    username: "lab-user", password: "[REDACTED]", authorization: "[REDACTED]", phone: "[REDACTED]"
  });
});

test("sensor summary clamps input and never issues blocking actions", () => {
  const result = buildSensorSummary({ radar: 99, ir: 50, uv: -10, rf: 20 });
  assert.equal(result.status, "high");
  assert.equal(result.sensors.uv, 0);
  assert.equal(result.response, "observe-and-record");
});

test("Phantom Flash is theatrical text only", () => {
  assert.match(phantomFlashMessage(), /ابتسم/);
  assert.match(phantomFlashMessage(), /تم التقاط الصورة بنجاح/);
});
