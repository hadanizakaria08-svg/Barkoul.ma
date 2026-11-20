import fs from "node:fs";
import vm from "node:vm";

const files = ["index.html", "admin.html"];
let failed = false;

for (const file of files) {
  const html = fs.readFileSync(file, "utf8");
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
    .map(match => match[1]).filter(source => source.trim());

  if (!scripts.length) {
    console.error(file + ": no inline JavaScript found");
    failed = true;
  }

  for (let i = 0; i < scripts.length; i++) {
    try {
      new vm.Script(scripts[i], { filename: file + "#inline-" + (i + 1) });
    } catch (error) {
      console.error(file + ": JavaScript syntax error: " + error.message);
      failed = true;
    }
  }

  const ids = [...html.matchAll(/\bid=["']([^"']+)["']/g)].map(match => match[1]);
  const duplicates = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
  const missing = [...new Set(
    [...html.matchAll(/\$\(["']([^"']+)["']\)/g)]
      .map(match => match[1]).filter(id => !ids.includes(id))
  )];

  if (duplicates.length) {
    console.error(file + ": duplicate element IDs: " + duplicates.join(", "));
    failed = true;
  }
  if (missing.length) {
    console.error(file + ": missing statically referenced IDs: " + missing.join(", "));
    failed = true;
  }
  if (/service_role|sb_secret_/i.test(html)) {
    console.error(file + ": server-side secret key pattern found in public HTML");
    failed = true;
  }

  console.log(file + ": " + (failed ? "validation has errors" : "validated"));
}

if (failed) process.exit(1);
