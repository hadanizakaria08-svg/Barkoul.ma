import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { describe, it } from "node:test";

const root = new URL("../", import.meta.url);
const sourceFiles = [
  "apps/web/src/App.tsx",
  "apps/web/src/Workspace.tsx",
  "apps/web/src/AdminRoom.tsx"
];
const sources = await Promise.all(sourceFiles.map(async (path) => ({
  path,
  content: await readFile(new URL(path, root), "utf8")
})));
const migrationNames = (await readdir(new URL("supabase/migrations/", root)))
  .filter((name) => name.endsWith(".sql"))
  .sort();
const migrations = await Promise.all(migrationNames.map(async (name) => ({
  name,
  content: await readFile(new URL(`supabase/migrations/${name}`, root), "utf8")
})));

function collectClientRpcCalls() {
  const calls = [];
  for (const source of sources) {
    const pattern = /\.rpc\(\s*["']([a-z0-9_]+)["']\s*,\s*\{([\s\S]*?)\}\s*\)/g;
    for (const match of source.content.matchAll(pattern)) {
      const argumentNames = [...match[2].matchAll(/\b(p_[a-z0-9_]+)\s*:/g)]
        .map((item) => item[1]);
      calls.push({ file: source.path, name: match[1], argumentNames });
    }
  }
  return calls;
}

function findLatestPublicFunction(name) {
  let found = null;
  const declaration = new RegExp(
    `CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+public\\.${name}\\s*\\(([^)]*)\\)([\\s\\S]*?)\\$function\\$`,
    "gi"
  );
  for (const migration of migrations) {
    for (const match of migration.content.matchAll(declaration)) {
      const argumentNames = match[1].trim()
        ? match[1].split(",").map((argument) => argument.trim().split(/\s+/)[0])
        : [];
      found = { migration: migration.name, argumentNames, header: match[2] };
    }
  }
  return found;
}

describe("frontend-to-database RPC contracts", () => {
  const calls = collectClientRpcCalls();

  it("declares every RPC used by the web application in a Supabase migration", () => {
    assert.ok(calls.length > 0, "expected to discover web RPC calls");
    for (const call of calls) {
      const declaration = findLatestPublicFunction(call.name);
      assert.ok(declaration, `${call.name} called by ${call.file} has no public SQL function migration`);
    }
  });

  it("keeps every client RPC argument name aligned with its latest SQL declaration", () => {
    for (const call of calls) {
      const declaration = findLatestPublicFunction(call.name);
      assert.deepEqual(
        [...call.argumentNames].sort(),
        [...declaration.argumentNames].sort(),
        `${call.name} argument mismatch between ${call.file} and ${declaration.migration}`
      );
    }
  });

  it("keeps public RPC wrappers invoker-rights with an empty search_path", () => {
    for (const call of calls) {
      const declaration = findLatestPublicFunction(call.name);
      assert.doesNotMatch(
        declaration.header,
        /SECURITY\s+DEFINER/i,
        `${call.name} must not expose a SECURITY DEFINER public wrapper`
      );
      assert.match(
        declaration.header,
        /SET\s+search_path\s+(?:=|TO)\s*''/i,
        `${call.name} must pin an empty search_path`
      );
    }
  });
});
