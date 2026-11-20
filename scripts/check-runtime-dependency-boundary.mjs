import fs from "node:fs";

const lock = JSON.parse(fs.readFileSync("package-lock.json", "utf8"));
if (lock.lockfileVersion !== 3) throw new Error("Expected npm lockfile version 3.");

const forbiddenPackages = new Set(["picomatch", "vite", "vite-plugin-pwa", "vitest", "workbox-build"]);
const found = Object.entries(lock.packages ?? {}).filter(([path]) => {
  const name = path.split("node_modules/").at(-1);
  return forbiddenPackages.has(name);
});

if (found.length > 0) {
  console.error("Packages removed for dependency-risk reduction are still present in the lockfile:");
  for (const [path, entry] of found) console.error(` - ${path} (${entry.version})`);
  process.exit(1);
}

const web = lock.packages["apps/web"];
const domain = lock.packages["packages/domain"];
if (!web || !domain) throw new Error("Missing workspace entries in package-lock.json.");
for (const [workspace, entry] of [["apps/web", web], ["packages/domain", domain]]) {
  for (const name of ["vite", "vite-plugin-pwa", "vitest", "picomatch"]) {
    if (entry.dependencies?.[name]) throw new Error(`${name} must not be a runtime dependency of ${workspace}`);
  }
}

console.log("Dependency boundary passed: picomatch, Vite, Vitest and Workbox are absent from the resolved tree.");
