import fs from "node:fs";
import vm from "node:vm";

const files = ["index.html", "admin.html"];
let failed = false;

for (const file of files) {
  const html = fs.readFileSync(file, "utf8");
  const ids = [...html.matchAll(/\bid=["']([^"']+)["']/g)].map((match) => match[1]);
  const seen = new Set();

  for (const id of ids) {
    if (seen.has(id)) {
      console.error(`[${file}] duplicate id: ${id}`);
      failed = true;
    }
    seen.add(id);
  }

  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
  let checked = 0;

  for (let index = 0; index < scripts.length; index += 1) {
    const [, attributes, source] = scripts[index];
    if (/\bsrc\s*=/.test(attributes)) continue;

    const type = attributes.match(/\btype\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase();
    if (type && type !== "module" && !/(?:java|ecma)script/.test(type)) continue;
    if (!source.trim()) continue;

    try {
      new vm.Script(source, { filename: `${file}#inline-script-${index + 1}` });
      checked += 1;
    } catch (error) {
      console.error(`[${file}] inline script ${index + 1}: ${error.message}`);
      failed = true;
    }
  }

  console.log(`[${file}] ${checked} inline script(s) parsed; ${ids.length} element id(s) checked.`);
}

if (failed) process.exitCode = 1;
