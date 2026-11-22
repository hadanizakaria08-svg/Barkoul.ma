import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const viewports = [
  { name: "phone-360x800", width: 360, height: 800 },
  { name: "phone-390x844", width: 390, height: 844 },
  { name: "phone-430x932", width: 430, height: 932 },
  { name: "tablet-768x1024", width: 768, height: 1024 },
  { name: "laptop-1024x768", width: 1024, height: 768 },
  { name: "desktop-1440x900", width: 1440, height: 900 }
];

async function capture(page, name) {
  const dir = join(process.cwd(), "test-results", "visual-qa");
  await mkdir(dir, { recursive: true });
  await page.screenshot({ path: join(dir, name + ".png"), fullPage: true, animations: "disabled" });
}
function overlaps(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x &&
    a.y < b.y + b.height && a.y + a.height > b.y;
}

test("visual QA captures both approved pages at phone, tablet and desktop sizes", async ({ page }) => {
  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    for (const route of [
      { path: "/", name: "welcome" },
      { path: "/?page=services", name: "services" }
    ]) {
      await page.goto(route.path);
      await page.locator(route.name === "welcome" ? ".approved-entry-hero" : ".approved-services-hero").waitFor();
      await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all(Array.from(document.images, image => image.decode().catch(() => undefined)));
      });
      const dimensions = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        document: document.documentElement.scrollWidth
      }));
      expect(dimensions.document, viewport.name + " " + route.name + " horizontal overflow")
        .toBeLessThanOrEqual(dimensions.viewport + 1);
      await capture(page, viewport.name + "-" + route.name);
    }
  }
});

test("mobile welcome hero has no map, brand or vehicle overlap and all hero images load", async ({ page }) => {
  for (const viewport of viewports.filter(item => item.width <= 900)) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto("/");
    const map = await page.locator(".approved-entry-map").boundingBox();
    const brand = await page.locator(".approved-entry-brand").boundingBox();
    const vehicles = await page.locator(".approved-entry-vehicles").boundingBox();
    expect(map, viewport.name + " map card is visible").not.toBeNull();
    expect(brand, viewport.name + " brand block is visible").not.toBeNull();
    expect(vehicles, viewport.name + " vehicle gallery is visible").not.toBeNull();
    expect(overlaps(map!, brand!), viewport.name + " map overlaps brand").toBe(false);
    expect(overlaps(brand!, vehicles!), viewport.name + " brand overlaps vehicle gallery").toBe(false);
    const images = await page.locator(".approved-entry-vehicles img").evaluateAll(nodes =>
      nodes.map(node => ({ complete: (node as HTMLImageElement).complete, width: (node as HTMLImageElement).naturalWidth }))
    );
    expect(images).toHaveLength(2);
    expect(images.every(image => image.complete && image.width > 0), viewport.name + " hero photos load").toBe(true);
  }
});
