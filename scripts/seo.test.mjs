import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const base = "https://hadanizakaria08-svg.github.io/Barkoul.ma/";
const [html, robots, sitemap, manifest] = await Promise.all([
  readFile(new URL("../apps/web/index.html", import.meta.url), "utf8"),
  readFile(new URL("../apps/web/public/robots.txt", import.meta.url), "utf8"),
  readFile(new URL("../apps/web/public/sitemap.xml", import.meta.url), "utf8"),
  readFile(new URL("../apps/web/public/manifest.webmanifest", import.meta.url), "utf8")
]);

test("SEO metadata declares the exact public GitHub Pages canonical URL", () => {
  assert.ok(html.includes('<link rel="canonical" href="' + base + '" />'));
  assert.match(html, /<meta\s+name="description"\s+content="[^"]{60,}"/);
  assert.match(html, /<meta\s+property="og:title"/);
  assert.match(html, /<meta\s+property="og:description"/);
  assert.match(html, /<meta\s+property="og:url"/);
  assert.doesNotMatch(html, /<meta\s+name="robots"\s+content="[^"]*noindex/i);
});

test("robots.txt allows crawling and points to the published sitemap", () => {
  assert.match(robots, /^User-agent:\s*\*\s*\nAllow:\s*\//m);
  assert.ok(robots.includes("Sitemap: " + base + "sitemap.xml"));
});

test("sitemap is valid XML-shaped content and lists only the canonical homepage", () => {
  assert.match(sitemap, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(sitemap, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
  assert.equal((sitemap.match(/<url>/g) ?? []).length, 1);
  assert.ok(sitemap.includes("<loc>" + base + "</loc>"));
  assert.match(sitemap, /<\/urlset>\s*$/);
});

test("web app manifest stays scoped to the GitHub Pages project path", () => {
  const data = JSON.parse(manifest);
  assert.equal(data.lang, "ar");
  assert.equal(data.dir, "rtl");
  assert.equal(data.start_url, "./");
  assert.equal(data.scope, "./");
});
