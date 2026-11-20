import fs from "node:fs";
import assert from "node:assert/strict";

const shell = fs.readFileSync("apps/web/index.html", "utf8");
const app = fs.readFileSync("apps/web/src/App.tsx", "utf8");
const admin = fs.readFileSync("apps/web/src/AdminRoom.tsx", "utf8");

assert.match(shell, /<div id="root"><\/div>/, "React mount point must exist");
assert.match(shell, /type="module" src="\.\/assets\/app\.js"/, "Built application entry must be loaded");
assert.match(shell, /\.\/assets\/app\.css/, "Built application styles must be loaded");
assert.match(app, /home-hero/, "Rebuilt responsive homepage hero must be present");
assert.match(app, /أنشر شحنة/, "Publish action must be present");
assert.match(app, /أبحث عن شحنة/, "Search action must be present");
assert.match(app, /#admin/, "Protected admin route must be present");
assert.match(admin, /admin_review_role_request/, "Admin role review workflow must remain present");
assert.match(admin, /admin_review_driver_document/, "Driver document review workflow must remain present");
assert.match(admin, /admin_record_commission_payment/, "Commission collection workflow must remain present");

const retired = ["index.html", "index-v2.html", "admin.html", "interface-preview.html", "preview-new-interface.html"];
const stillPresent = retired.filter((file) => fs.existsSync(file));
assert.deepEqual(stillPresent, [], "Legacy standalone interfaces must be retired from the repository root");

for (const [name, source] of [["apps/web/index.html", shell], ["apps/web/src/App.tsx", app], ["apps/web/src/AdminRoom.tsx", admin]]) {
  assert.doesNotMatch(source, /service_role|sb_secret_/i, name + " must not contain a server-side key");
}
console.log("Responsive photo-led React homepage verified; legacy root interfaces retired; admin workflows preserved.");
