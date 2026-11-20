import { createHash } from "node:crypto";

const SYNTHETIC_NAMES = ["سائق تجريبي 01", "صاحب شحنة تجريبي 02", "ناقل افتراضي 03"];
const CITIES = ["الدار البيضاء", "مراكش", "طنجة", "فاس", "أكادير", "وجدة"];
const GOODS = ["خضر تجريبية", "مواد بناء وهمية", "أثاث تجريبي", "بضاعة افتراضية"];

function digest(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

// Generates a wholly synthetic, deterministic snapshot for the current second.
// It has no database, network, camera, browser-storage, or production credentials.
export function createPhantomSnapshot(nowMs = Date.now()) {
  const second = Math.floor(nowMs / 1000);
  const seed = createHash("sha256").update(`barkoul-phantom-${second}`).digest();
  const pick = (items, offset) => items[seed[offset] % items.length];
  const suffix = seed.readUInt16BE(8).toString(16).padStart(4, "0").toUpperCase();

  return Object.freeze({
    labOnly: true,
    generatedAtSecond: second,
    generation: suffix,
    profiles: Object.freeze([
      Object.freeze({ id: `DECOY-P-${suffix}`, displayName: pick(SYNTHETIC_NAMES, 0), phone: "+212 600 000 000" })
    ]),
    cargos: Object.freeze([
      Object.freeze({
        id: `DECOY-C-${suffix}`,
        origin: pick(CITIES, 1),
        destination: pick(CITIES, 2),
        goods: pick(GOODS, 3),
        status: "synthetic-open"
      })
    ]),
    apiSurface: Object.freeze({
      host: `api-${suffix.toLowerCase()}.phantom.invalid`,
      token: `DECOY-TOKEN-${suffix}`
    })
  });
}

export function classifyShieldSignal(input = {}) {
  const text = String(input.payload ?? "").toLowerCase();
  const indicators = [
    ["sql-probe", /(?:union\\s+select|or\\s+1=1|information_schema)/],
    ["path-probe", /(?:\.\\.\\/|%2e%2e%2f|etc\\/passwd)/],
    ["script-probe", /(?:<script|javascript:|onerror\\s*=)/]
  ];
  const detected = indicators.filter(([, pattern]) => pattern.test(text)).map(([name]) => name);
  const severity = detected.length >= 2 ? "high" : detected.length === 1 ? "elevated" : "normal";
  const color = severity === "high" ? "red" : severity === "elevated" ? "amber" : "green";

  return Object.freeze({
    source: "synthetic-lab-input",
    detected: Object.freeze(detected),
    severity,
    chameleonColor: color,
    action: "observe-only"
  });
}

export function phantomFlashMessage() {
  return "ابتسم! تم التقاط الصورة بنجاح";
}

export function redactEvidence(event = {}) {
  const forbidden = /password|secret|token|authorization|cookie|phone|email|document|credential/i;
  const safe = {};
  for (const [key, value] of Object.entries(event)) {
    safe[key] = forbidden.test(key) ? "[REDACTED]" :
      typeof value === "string" ? value.slice(0, 240) :
      typeof value === "number" || typeof value === "boolean" || value === null ? value :
      "[OMITTED]";
  }
  return safe;
}

export class EvidenceChain {
  #entries = [];

  append(event, timestamp = new Date().toISOString()) {
    const safeEvent = redactEvidence(event);
    const previousHash = this.#entries.at(-1)?.hash ?? "GENESIS";
    const body = { index: this.#entries.length, timestamp, previousHash, event: safeEvent };
    const entry = Object.freeze({ ...body, hash: digest(body) });
    this.#entries.push(entry);
    return entry;
  }

  export() {
    return this.#entries.map(entry => ({ ...entry, event: { ...entry.event } }));
  }

  static verify(entries) {
    let previousHash = "GENESIS";
    for (let index = 0; index < entries.length; index += 1) {
      const { hash, ...body } = entries[index];
      if (body.index !== index || body.previousHash !== previousHash || digest(body) !== hash) return false;
      previousHash = hash;
    }
    return true;
  }
}

// Military-inspired ideas are represented as defensive telemetry only:
// radar=event correlation, IR=behavior changes, UV=hidden-pattern checks,
// RF=connection metadata. No weapon control or third-party scanning.
export function buildSensorSummary({ radar = 0, ir = 0, uv = 0, rf = 0 } = {}) {
  const values = { radar, ir, uv, rf };
  const normalized = Object.fromEntries(Object.entries(values).map(([key, value]) => [
    key, Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0
  ]));
  const peak = Math.max(...Object.values(normalized));
  return Object.freeze({
    sensors: Object.freeze(normalized),
    status: peak >= 80 ? "high" : peak >= 45 ? "watch" : "normal",
    response: "observe-and-record"
  });
}
