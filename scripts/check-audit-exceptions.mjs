import fs from "node:fs";

const reportPath = process.argv[2] ?? "npm-audit-full.json";
const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
const vulnerabilities = Object.entries(report.vulnerabilities ?? {});
const advisoryId = "GHSA-fc5q-39xc-vjpf";
const exceptionExpiresAt = Date.parse("2026-12-02T00:00:00Z");

if (Date.now() >= exceptionExpiresAt) {
  console.error("Expired temporary exception for " + advisoryId + "; re-triage upstream status.");
  process.exit(1);
}

const approved = new Set(["picomatch"]);
const pending = new Map(vulnerabilities);
const accepted = [];

function hasSafeFixState(value) {
  return value === false || (value && typeof value === "object" && value.isSemVerMajor === true);
}

let changed = true;
while (changed) {
  changed = false;
  for (const [name, item] of [...pending]) {
    const via = Array.isArray(item.via) ? item.via : [];
    const advisories = via.filter((entry) => typeof entry === "object" && entry !== null);
    const dependencyNames = via.filter((entry) => typeof entry === "string");
    const directPicomatchAdvisory =
      name === "picomatch" &&
      advisories.length > 0 &&
      advisories.every((entry) =>
        entry.url?.includes(advisoryId) &&
        entry.name === "picomatch" &&
        entry.severity === "high"
      ) &&
      dependencyNames.length === 0;
    const transitiveOnlyThroughApproved =
      advisories.length === 0 &&
      dependencyNames.length > 0 &&
      dependencyNames.every((dependency) => approved.has(dependency));

    if (
      item.severity === "high" &&
      item.isDirect === false &&
      hasSafeFixState(item.fixAvailable) &&
      (directPicomatchAdvisory || transitiveOnlyThroughApproved)
    ) {
      approved.add(name);
      pending.delete(name);
      accepted.push({ name, via: dependencyNames.length ? dependencyNames : [advisoryId] });
      changed = true;
    }
  }
}

if (pending.size > 0) {
  console.error("Unapproved dependency advisories detected:");
  for (const [name, item] of pending) {
    console.error(JSON.stringify({
      package: name,
      severity: item.severity,
      direct: item.isDirect,
      via: item.via,
      fixAvailable: item.fixAvailable
    }));
  }
  process.exit(1);
}

if (vulnerabilities.length === 0) {
  console.log("npm audit: zero dependency vulnerabilities.");
} else {
  console.log("Temporary exception accepted only for the dev-only " + advisoryId + " dependency chain:");
  for (const item of accepted) console.log(" - " + item.name);
  console.log("Exception expires 2026-12-01 23:59 UTC. All unrelated advisories fail this gate.");
}
