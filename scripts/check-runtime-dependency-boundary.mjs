import fs from "node:fs";

const lock = JSON.parse(fs.readFileSync("package-lock.json", "utf8"));
if (lock.lockfileVersion !== 3) {
  throw new Error("Expected npm lockfile version 3.");
}

const matches = Object.entries(lock.packages ?? {}).filter(([path]) =>
  /(^|\/)node_modules\/picomatch$/.test(path)
);

if (matches.length === 0) {
  throw new Error("Expected the current dev-tool dependency chain to be visible in package-lock.json.");
}

const runtimeMatches = matches.filter(([, entry]) => entry.dev !== true);
if (runtimeMatches.length > 0) {
  console.error("picomatch must remain development-only; runtime paths found:");
  for (const [path] of runtimeMatches) console.error(" - " + path);
  process.exit(1);
}

const web = lock.packages["apps/web"];
const domain = lock.packages["packages/domain"];
for (const [workspace, entry, forbidden] of [
  ["apps/web", web, ["vite", "vite-plugin-pwa"]],
  ["packages/domain", domain, ["vitest"]]
]) {
  if (!entry) throw new Error("Missing workspace lock entry: " + workspace);
  for (const dependency of forbidden) {
    if (entry.dependencies?.[dependency]) {
      throw new Error(dependency + " must not be a runtime dependency of " + workspace);
    }
  }
}

console.log("Runtime dependency boundary passed: every picomatch copy is dev-only.");
console.log("Resolved picomatch versions: " + [...new Set(matches.map(([, entry]) => entry.version))].join(", "));
