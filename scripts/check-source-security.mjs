import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve("apps/web/src");
const extensions = new Set([".js", ".jsx", ".ts", ".tsx"]);
const forbidden = [
  ["dangerouslySetInnerHTML", /dangerouslySetInnerHTML/],
  ["document.write", /document\s*\.\s*write\s*\(/],
  ["eval()", /\beval\s*\(/],
  ["Function constructor", /\bnew\s+Function\s*\(/],
  ["direct innerHTML assignment", /\.innerHTML\s*=/]
];

async function collect(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collect(fullPath));
    else if (extensions.has(path.extname(entry.name))) files.push(fullPath);
  }
  return files;
}

const violations = [];
for (const file of await collect(root)) {
  const source = await readFile(file, "utf8");
  for (const [label, pattern] of forbidden) {
    if (pattern.test(source)) violations.push({ file: path.relative(process.cwd(), file), rule: label });
  }
}

const details = violations.map((item) => item.file + ": " + item.rule).join("\n");
assert.equal(violations.length, 0, "Unsafe DOM/code-execution patterns found:\n" + details);
console.log("Source security guard passed: no direct HTML injection or dynamic code execution sinks found.");
