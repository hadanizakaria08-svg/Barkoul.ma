import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("renders the approved Arabic RTL welcome screen with Morocco map, truck, bus and login", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Barkoul\.ma/);
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator(".approved-entry-hero")).toBeVisible();
  await expect(page.getByRole("img", { name: "خريطة المغرب" })).toBeVisible();
  await expect(page.locator(".approved-entry-vehicles img")).toHaveCount(2);
  await expect(page.getByRole("heading", { name: "تسجيل الدخول" })).toBeVisible();
  await expect(page.getByLabel("البريد الإلكتروني")).toBeVisible();
  await expect(page.getByRole("link", { name: "تصفح خدمات الموقع كزائر" })).toHaveAttribute("href", "?page=services");
});

test("opens the separate services and publishing routes without exposing the cargo form to guests", async ({ page }) => {
  await page.goto("/?page=services");
  await expect(page.locator(".approved-services-hero")).toBeVisible();
  await expect(page.locator("#publish")).toHaveCount(0);
  await page.locator(".approved-services-topbar").getByRole("link", { name: "أنشر شحنة" }).click();
  await expect(page).toHaveURL(/[?]page=publish#publish-account$/);
  await expect(page.getByRole("heading", { name: "أنشر شحنتك" })).toBeVisible();
  await expect(page.getByLabel("البريد الإلكتروني")).toBeVisible();
  await expect(page.locator("#publish")).toHaveCount(0);
});

test("does not expose publisher-role refresh to signed-out visitors", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "إعادة التحقق من الصلاحية" })).toHaveCount(0);
});

test("preserves route filters, all cargo categories, vehicle groups and private publishing controls", async ({ page }) => {
  await page.goto("/?page=services");
  await expect(page.locator("#search").getByLabel("من مدينة")).toBeVisible();
  await expect(page.locator("#search").getByLabel("إلى مدينة")).toBeVisible();
  await expect(page.locator("#search").getByLabel("نوع المركبة")).toBeVisible();
  await expect(page.locator(".approved-category-grid a")).toHaveCount(27);
  await expect(page.locator("#vehicle-categories .vehicle-category-card")).toHaveCount(3);
  await expect(page.getByText("شحنات أخرى", {exact:true})).toBeVisible();
  await expect(page.getByLabel("البريد الإلكتروني")).toHaveCount(0);
  await page.locator("#vehicle-categories").getByRole("button", { name: "الشاحنات الصغيرة" }).click();
  await page.locator("#vehicle-categories").getByRole("button", { name: "شاحنة صغيرة", exact: true }).click();
  await expect(page.locator("#search").getByLabel("نوع المركبة")).toHaveValue("شاحنة صغيرة");
  await page.goto("/?page=publish#publish-account");
  await expect(page.getByLabel("البريد الإلكتروني")).toBeVisible();
  await expect(page.getByLabel("كلمة المرور")).toBeVisible();
});

test("keeps both approved public pages responsive without horizontal overflow at common device widths", async ({ page }) => {
  for (const width of [320, 360, 390, 430, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ["/", "/?page=services"]) {
      await page.goto(path);
      const dimensions = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        document: document.documentElement.scrollWidth
      }));
      expect(dimensions.document, `horizontal overflow at ${width}px on ${path}`).toBeLessThanOrEqual(dimensions.viewport);
    }
  }
});

test("meets automated WCAG 2.2 AA accessibility checks on the approved welcome screen", async ({ page }) => {
  await page.goto("/");
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations).toEqual([]);
});

test("ships a restrictive browser security policy and referrer policy", async ({ page }) => {
  await page.goto("/");
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute("content");
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("object-src 'none'");
  expect(csp).toContain("script-src 'self'");
  expect(csp).toContain("https://*.supabase.co");
  expect(csp).not.toContain("'unsafe-eval'");
  await expect(page.locator('meta[name="referrer"]')).toHaveAttribute("content", "strict-origin-when-cross-origin");
});

test("blocks direct access to the private admin room for signed-out visitors", async ({ page }) => {
  await page.goto("/#admin");
  await expect(page.getByRole("heading", { name: "غرفة المدير" })).toBeVisible();
  await expect(page.getByText("سجّل الدخول أولاً", { exact: false })).toBeVisible();
  await expect(page.getByText("مركز التحكم")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "تسجيل الخروج" })).toHaveCount(0);
});

test("keeps the welcome screen focused on direct sign-in and preserves the map attribution separately", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".approved-entry-role-choice")).toHaveCount(0);
  await expect(page.getByRole("link", { name: /غرفة المدير/ })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "تسجيل الدخول" })).toBeVisible();
  await expect(page.locator(".approved-map-attribution")).toContainText("Vegeta228");
  await expect(page.locator(".approved-map-attribution")).toContainText("CC BY-SA 4.0");
  await expect(page.locator(".approved-map-attribution a").last()).toHaveAttribute("href", "https://creativecommons.org/licenses/by-sa/4.0/");
  await expect(page.locator(".approved-map-routes")).toHaveCount(0);
  await expect(page.locator(".approved-entry-map .morocco-mark")).toHaveAttribute("loading", "eager");
  await expect(page.locator(".approved-map-attribution")).toBeVisible();
});

test("vehicle subtype choices always include a visible photo and update the route filter", async ({ page }) => {
  await page.goto("/?page=services");
  const groups = page.locator("#vehicle-categories .vehicle-category-card");
  await expect(groups).toHaveCount(3);
  for (const groupName of ["الشاحنات الكبيرة", "الشاحنات الصغيرة", "الحافلات"]) {
    await page.locator("#vehicle-categories").getByRole("button", { name: new RegExp(groupName) }).click();
    const subtypeCards = page.locator(".vehicle-subtype-card");
    await expect(subtypeCards.first()).toBeVisible();
    const subtypeCount = await subtypeCards.count();
    await expect(subtypeCards.locator("img")).toHaveCount(subtypeCount);
    for (let index = 0; index < subtypeCount; index += 1) {
      await expect(subtypeCards.nth(index).locator("img")).toHaveAttribute("src", /^https:\/\//);
    }
    await subtypeCards.first().click();
    await expect(page.locator("#search").getByLabel("نوع المركبة")).not.toHaveValue("");
  }
});

test("services screen passes automated WCAG 2.2 AA checks", async ({ page }) => {
  await page.goto("/?page=services");
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations).toEqual([]);
});

test("keeps the complete Morocco map contained and attribution outside the map on desktop and mobile", async ({ page }) => {
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const dimensions = await page.evaluate(() => {
      const art = document.querySelector(".approved-map-art")?.getBoundingClientRect();
      const map = document.querySelector(".approved-entry-map .morocco-mark")?.getBoundingClientRect();
      const credit = document.querySelector(".approved-map-attribution")?.getBoundingClientRect();
      return art && map && credit ? {
        artWidth: art.width, artHeight: art.height,
        mapWidth: map.width, mapHeight: map.height,
        mapInsideArt: map.left >= art.left - 1 && map.right <= art.right + 1 &&
          map.top >= art.top - 1 && map.bottom <= art.bottom + 1,
        creditBelowMap: credit.top >= map.bottom - 1
      } : null;
    });
    expect(dimensions).not.toBeNull();
    expect(dimensions!.mapInsideArt).toBe(true);
    expect(dimensions!.creditBelowMap).toBe(true);
    expect(dimensions!.mapWidth).toBeGreaterThan(0);
    expect(dimensions!.mapHeight).toBeGreaterThan(0);
  }
});

test("uses real photo assets for all three main vehicle groups", async ({ page }) => {
  await page.goto("/?page=services");
  const images = page.locator("#vehicle-categories .vehicle-category-card img");
  await expect(images).toHaveCount(3);
  for (let index = 0; index < 3; index += 1) {
    await expect(images.nth(index)).toHaveAttribute("src", /^https:\/\/images\.unsplash\.com\//);
  }
});
