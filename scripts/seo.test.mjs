import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const accountSpecificHost = "hadanizakaria08-svg.github.io";
const [html, robots, sitemap, manifest, readme] = await Promise.all([
  readFile(new URL("../apps/web/index.html", import.meta.url), "utf8"),
  readFile(new URL("../apps/web/public/robots.txt", import.meta.url), "utf8"),
  readFile(new URL("../apps/web/public/sitemap.xml", import.meta.url), "utf8"),
  readFile(new URL("../apps/web/public/manifest.webmanifest", import.meta.url), "utf8"),
  readFile(new URL("../README.md", import.meta.url), "utf8")
]);

test("SEO metadata avoids publishing the temporary account-specific host", () => {
  assert.match(html, /<meta\s+name="description"\s+content="[^"]{60,}"/);
  assert.match(html, /<meta\s+property="og:title"/);
  assert.match(html, /<meta\s+property="og:description"/);
  assert.doesNotMatch(html, /<link\s+rel="canonical"/i);
  assert.doesNotMatch(html, /<meta\s+property="og:url"/i);
  assert.doesNotMatch(html, new RegExp(accountSpecificHost, "i"));
  assert.doesNotMatch(html, /<meta\s+name="robots"\s+content="[^"]*noindex/i);
});

test("robots.txt keeps the public site crawlable without exposing the temporary host", () => {
  assert.match(robots, /^User-agent:\s*\*\s*\nAllow:\s*\//m);
  assert.doesNotMatch(robots, /sitemap:/i);
  assert.doesNotMatch(robots, new RegExp(accountSpecificHost, "i"));
});

test("sitemap remains valid XML and contains no temporary account-specific URL", () => {
  assert.match(sitemap, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(sitemap, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
  assert.equal((sitemap.match(/<url>/g) ?? []).length, 0);
  assert.match(sitemap, /<\/urlset>\s*$/);
  assert.doesNotMatch(sitemap, new RegExp(accountSpecificHost, "i"));
});

test("web app manifest remains Arabic RTL and scoped to the project root", () => {
  const data = JSON.parse(manifest);
  assert.equal(data.lang, "ar");
  assert.equal(data.dir, "rtl");
  assert.equal(data.start_url, "./");
  assert.equal(data.scope, "./");
});

test("project documentation does not publish the temporary account-specific host", () => {
  assert.doesNotMatch(readme, new RegExp(accountSpecificHost, "i"));
});
