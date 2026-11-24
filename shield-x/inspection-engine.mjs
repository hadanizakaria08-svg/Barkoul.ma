import { createHash } from "node:crypto";

const MAX_PATH_CHARS = 2_048;
const MAX_BODY_CHARS = 8_192;
const MAX_FINDINGS = 12;

const RULES = [
  { id: "SX-SQL-001", category: "sql-injection-probe", severity: "high", pattern: /(?:\bunion\s+(?:all\s+)?select\b|\binformation_schema\b|(?:['"]\s*)(?:or|and)\s+\d+\s*=\s*\d+)/i },
  { id: "SX-XSS-001", category: "script-injection-probe", severity: "high", pattern: /(?:<\s*script\b|javascript\s*:|\bon(?:error|load|click|focus|mouseover)\s*=)/i },
  { id: "SX-PATH-001", category: "path-traversal-probe", severity: "high", pattern: /(?:\.\.[/\\]|%2e%2e(?:%2f|%5c)|\/etc\/passwd)/i },
  { id: "SX-CMD-001", category: "command-injection-probe", severity: "high", pattern: /(?:;\s*(?:id|whoami|uname|cat)\b|\|\s*(?:sh|bash)\b|\$\([^)]{1,80}\))/i }
];

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function safeDecode(value) {
  try { return decodeURIComponent(value); } catch { return value; }
}

function boundedString(value, max) {
  return typeof value === "string" ? value.slice(0, max) : "";
}

/**
 * Offline-only request inspection. This is a small defensive ruleset for
 * synthetic fixtures, not Coraza, OWASP CRS, a network proxy, or a blocker.
 * Raw request bodies and headers are never returned or stored.
 */
export function inspectShieldRequest(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("Request input must be an object");
  }

  const method = boundedString(input.method ?? "GET", 16).toUpperCase();
  const rawPath = boundedString(input.path ?? "/", MAX_PATH_CHARS);
  const rawBody = boundedString(input.body ?? "", MAX_BODY_CHARS);
  const truncated = (typeof input.path === "string" && input.path.length > MAX_PATH_CHARS) ||
    (typeof input.body === "string" && input.body.length > MAX_BODY_CHARS);

  let pathname = "/";
  let search = "";
  try {
    const parsed = new URL(rawPath, "https://shield-lab.invalid");
    pathname = parsed.pathname;
    search = parsed.search;
  } catch {
    return Object.freeze({
      accepted: false,
      reason: "invalid-path",
      action: "observe-only"
    });
  }

  const inspectionText = [safeDecode(pathname), safeDecode(search), safeDecode(rawBody)].join("\n");
  const findings = [];
  for (const rule of RULES) {
    if (rule.pattern.test(inspectionText)) {
      findings.push(Object.freeze({
        ruleId: rule.id,
        category: rule.category,
        severity: rule.severity
      }));
      if (findings.length >= MAX_FINDINGS) break;
    }
  }

  const severity = findings.some(item => item.severity === "high")
    ? "high"
    : findings.length ? "watch" : "normal";

  return Object.freeze({
    accepted: true,
    method: /^[A-Z]{1,16}$/.test(method) ? method : "UNKNOWN",
    routeFingerprint: sha256(pathname).slice(0, 16),
    bodyLength: rawBody.length,
    truncated,
    findings: Object.freeze(findings),
    severity,
    action: "observe-only"
  });
}

/**
 * Redacts sensitive keys and discards nested/unexpected values before evidence
 * is hashed. This is data minimization, not a guarantee that every arbitrary
 * caller-supplied string is safe; callers should pass only structured metadata.
 */
export function redactShieldEvidence(event = {}) {
  if (!event || typeof event !== "object" || Array.isArray(event)) {
    return Object.freeze({ event: "[OMITTED]" });
  }
  const safe = {};
  const sensitive = /password|secret|token|authorization|cookie|phone|email|document|credential|body|payload|query/i;
  for (const [key, value] of Object.entries(event).slice(0, 32)) {
    if (sensitive.test(key)) safe[key] = "[REDACTED]";
    else if (typeof value === "string") safe[key] = value.slice(0, 160);
    else if (typeof value === "number" || typeof value === "boolean" || value === null) safe[key] = value;
    else safe[key] = "[OMITTED]";
  }
  return Object.freeze(safe);
}

export class ShieldEvidenceLedger {
  #entries = [];

  append(event, timestamp = new Date().toISOString()) {
    if (!Number.isFinite(Date.parse(timestamp))) throw new TypeError("Invalid evidence timestamp");
    const body = Object.freeze({
      sequence: this.#entries.length + 1,
      timestamp,
      previousHash: this.#entries.at(-1)?.hash ?? "GENESIS",
      event: redactShieldEvidence(event)
    });
    const hash = sha256(JSON.stringify(body));
    const entry = Object.freeze({ ...body, hash });
    this.#entries.push(entry);
    return entry;
  }

  export() {
    return this.#entries.map(entry => ({
      ...entry,
      event: { ...entry.event }
    }));
  }

  static verify(entries) {
    if (!Array.isArray(entries)) return false;
    let previousHash = "GENESIS";
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      if (!entry || typeof entry !== "object") return false;
      const body = {
        sequence: entry.sequence,
        timestamp: entry.timestamp,
        previousHash: entry.previousHash,
        event: entry.event
      };
      if (body.sequence !== index + 1 ||
          body.previousHash !== previousHash ||
          !Number.isFinite(Date.parse(body.timestamp)) ||
          sha256(JSON.stringify(body)) !== entry.hash) return false;
      previousHash = entry.hash;
    }
    return true;
  }
}
