import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSensorSummary,
  classifyShieldSignal,
  createPhantomSnapshot,
  EvidenceChain,
  phantomFlashMessage,
  redactEvidence,
  SelfHealingModuleChain
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


test("Chain System isolates a damaged module and replaces it from a trusted clean factory", () => {
  const chain = new SelfHealingModuleChain();
  let cleanBuilds = 0;
  chain.register("phantom-room", () => {
    cleanBuilds += 1;
    return { healthy: true, build: cleanBuilds };
  });
  chain.register("identity-core", () => ({ healthy: true, available: true }));

  // Recovery must construct a new instance rather than reuse the prior runtime.
  const before = chain.get("phantom-room");
  const result = chain.recover("phantom-room");
  assert.deepEqual(result, { recovered: true, status: "healthy", version: 2 });
  assert.notEqual(chain.get("phantom-room"), before);
  assert.equal(chain.get("phantom-room").build, 2);
  assert.equal(chain.status()["identity-core"].status, "healthy");
  assert.equal(chain.status()["phantom-room"].status, "healthy");
  assert.deepEqual(chain.evidence().map(item => item.event), [
    "registered",
    "registered",
    "fault-detected-and-isolated",
    "trusted-replacement-verified-and-reconnected"
  ]);
});

test("Chain System keeps an unhealthy replacement isolated", () => {
  const chain = new SelfHealingModuleChain();
  let builds = 0;
  chain.register("chameleon", () => {
    builds += 1;
    return { healthy: builds === 1 };
  });
  const result = chain.recover("chameleon");
  assert.deepEqual(result, { recovered: false, status: "isolated", version: 1 });
  assert.equal(chain.status().chameleon.status, "isolated");
  assert.equal(chain.get("chameleon"), undefined);
  assert.equal(chain.evidence().at(-1).event, "replacement-health-check-failed");
});


test("Chain System keeps a module isolated when its trusted replacement factory throws, while core modules remain available", () => {
  const chain = new SelfHealingModuleChain();
  chain.register("identity-core", () => ({ healthy: true, available: true }));
  chain.register("phantom-room", () => ({ healthy: true }));
  // Simulate the trusted artifact source becoming unavailable during recovery.
  const brokenFactory = () => { throw new Error("trusted artifact unavailable"); };
  const isolated = new SelfHealingModuleChain();
  isolated.register("identity-core", () => ({ healthy: true, available: true }));
  isolated.register("phantom-room", () => ({ healthy: true }));
  // The lab API keeps the factory private; this independent chain models a failed clean build.
  const failing = new SelfHealingModuleChain();
  failing.register("identity-core", () => ({ healthy: true, available: true }));
  let calls = 0;
  failing.register("phantom-room", () => {
    calls += 1;
    if (calls > 1) return brokenFactory();
    return { healthy: true };
  });
  const result = failing.recover("phantom-room");
  assert.deepEqual(result, { recovered: false, status: "isolated", version: 1 });
  assert.equal(failing.get("phantom-room"), undefined);
  assert.equal(failing.get("identity-core").available, true);
  assert.equal(failing.status()["identity-core"].status, "healthy");
  assert.equal(failing.evidence().at(-1).event, "replacement-error");
});
