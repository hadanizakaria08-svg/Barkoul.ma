import fs from "node:fs";
import assert from "node:assert/strict";

const html = fs.readFileSync("apps/web/index.html", "utf8");
const app = fs.readFileSync("apps/web/src/App.tsx", "utf8");
const admin = fs.readFileSync("apps/web/src/AdminRoom.tsx", "utf8");

assert.match(html, /<html lang="ar" dir="rtl">/, "The deployed app must be Arabic RTL");
assert.match(html, /<div id="root"><\/div>/, "React root is required");
assert.match(html, /assets\/app\.js/, "The compiled app entry is required");
assert.match(html, /assets\/app\.css/, "The compiled stylesheet is required");
assert.match(html, /Content-Security-Policy/, "A content security policy is required");
assert.match(app, /reference-hero/, "The approved homepage must be present");
assert.match(app, /HeroTruckScene/, "The truck illustration must be present");
assert.match(app, /MoroccoMark/, "The Morocco map must be present");
assert.match(app, /أبحث عن شحنة/, "The search action must be present");
assert.match(app, /أنشر شحنة/, "The publish action must be present");
assert.match(app, /AdminRoom/, "The protected admin interface must remain integrated");
assert.match(admin, /admin_review_role_request/, "Admin role review must remain integrated");
assert.match(admin, /admin_review_driver_document/, "Driver document review must remain integrated");
assert.doesNotMatch(html + app + admin, /service_role|sb_secret_/i, "Public app source must not contain server-side secrets");

const ids = [...html.matchAll(/\bid=["']([^"']+)["']/g)].map((match) => match[1]);
assert.equal(new Set(ids).size, ids.length, "The app shell must not contain duplicate IDs");

const retired = ["index.html", "index-v2.html", "admin.html", "interface-preview.html", "preview-new-interface.html"];
assert.deepEqual(retired.filter((file) => fs.existsSync(file)), [], "Legacy root interfaces must be absent");
console.log("Pages validation passed: Arabic RTL app shell, approved interface, protected admin route, and no legacy root pages.");
