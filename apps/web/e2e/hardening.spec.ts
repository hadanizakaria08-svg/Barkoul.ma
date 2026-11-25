import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("keeps both approved public pages within common mobile and desktop widths", async ({ page }) => {
  for (const width of [320, 360, 375, 390, 414, 768, 1024, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ["/", "/?page=services"]) {
      await page.goto(path);
      const dimensions = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        document: document.documentElement.scrollWidth
      }));
      expect(dimensions.document, "horizontal overflow at " + width + "px on " + path)
        .toBeLessThanOrEqual(dimensions.viewport);
    }
  }
});

test("keeps the signed-out administrator gate usable on narrow screens", async ({ page }) => {
  for (const width of [320, 360, 390, 768]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/#admin");
    await expect(page.getByRole("heading", { name: "غرفة المدير" })).toBeVisible();
    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      document: document.documentElement.scrollWidth
    }));
    expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);
    await expect(page.getByRole("link", { name: "العودة إلى المنصة" })).toBeVisible();
    await expect(page.getByRole("link", { name: "تسجيل الدخول" })).toBeVisible();
  }
});

test("allows switching between login, signup, and password recovery on the welcome screen", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "ليس لديك حساب؟ أنشئ حساباً" }).click();
  await expect(page.getByRole("heading", { name: "إنشاء حساب جديد" })).toBeVisible();
  await expect(page.getByLabel("الاسم الكامل")).toBeVisible();
  await expect(page.getByLabel("كلمة المرور")).toHaveAttribute("autocomplete", "new-password");

  await page.getByRole("button", { name: "لديك حساب؟ سجل الدخول" }).click();
  await expect(page.getByRole("heading", { name: "تسجيل الدخول" })).toBeVisible();
  await expect(page.getByLabel("الاسم الكامل")).toHaveCount(0);

  await page.getByRole("button", { name: "نسيت كلمة المرور؟" }).click();
  await expect(page.getByRole("heading", { name: "استعادة كلمة المرور" })).toBeVisible();
  await expect(page.locator(".approved-login-form input[type=\"password\"]")).toBeHidden();
  await page.getByRole("button", { name: "العودة إلى الدخول" }).click();
  await expect(page.getByRole("heading", { name: "تسجيل الدخول" })).toBeVisible();
});

test("keeps cargo publication fields private until a visitor signs in", async ({ page }) => {
  await page.goto("/?page=services");
  await expect(page.locator("#publish")).toHaveCount(0);
  await page.locator(".approved-services-topbar").getByRole("link", { name: "أنشر شحنة" }).click();
  await expect(page.getByLabel("البريد الإلكتروني")).toBeVisible();
  await expect(page.locator("#publish")).toHaveCount(0);
});

test("accepts Arabic origin, destination and vehicle filters including bus types", async ({ page }) => {
  await page.goto("/?page=services");
  const search = page.locator("#search");
  await search.getByLabel("من مدينة").fill("الدار البيضاء");
  await search.getByLabel("إلى مدينة").fill("مراكش");
  await search.getByLabel("نوع المركبة").selectOption({label:"شاحنة تبريد"});
  await expect(search.getByLabel("من مدينة")).toHaveValue("الدار البيضاء");
  await expect(search.getByLabel("إلى مدينة")).toHaveValue("مراكش");
  await expect(search.getByLabel("نوع المركبة")).toHaveValue("شاحنة تبريد");
  await search.getByLabel("نوع المركبة").selectOption({label:"حافلة سياحية"});
  await expect(search.getByLabel("نوع المركبة")).toHaveValue("حافلة سياحية");
  await expect(page.getByRole("heading", { name: "الشحنات المتاحة" })).toBeVisible();
});

test("connects the welcome, services, search, category and publishing navigation", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "تصفح خدمات الموقع كزائر" }).click();
  await expect(page).toHaveURL(/[?]page=services$/);
  await expect(page.locator(".approved-services-hero")).toBeVisible();

  await page.locator(".approved-search-actions").getByRole("link", { name: "أبحث عن شحنة" }).click();
  await expect(page).toHaveURL(/[?]page=services#available-cargos$/);
  await expect(page.locator("#available-cargos")).toBeVisible();

  await page.locator("#vehicle-categories").getByRole("button", { name: /شاحنات كبيرة/ }).click();
  await page.locator("#vehicle-categories").getByRole("button", { name: "شاحنة تبريد" }).click();
  await expect(page.locator("#search").getByLabel("نوع المركبة")).toHaveValue("شاحنة تبريد");

  await page.locator(".approved-services-topbar").getByRole("link", { name: "أنشر شحنة" }).click();
  await expect(page).toHaveURL(/[?]page=publish#publish-account$/);
  await expect(page.getByLabel("البريد الإلكتروني")).toBeVisible();
});

test("meets automated WCAG 2.2 AA checks across both approved public pages", async ({ page }) => {
  for (const path of ["/", "/?page=services"]) {
    await page.goto(path);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(results.violations, "accessibility violations on " + path).toEqual([]);
  }
});

test("keeps all category image cards descriptive and sourced from the approved image host", async ({ page }) => {
  await page.goto("/?page=services");
  const cards = page.locator(".vehicle-category-card");
  await expect(cards).toHaveCount(3);
  const imageData = await cards.locator("img").evaluateAll(images =>
    images.map(image => ({
      alt: image.getAttribute("alt"),
      src: image.getAttribute("src")
    }))
  );
  expect(imageData.every(image => Boolean(image.alt) && (image.src?.startsWith("https://images.unsplash.com/") || image.src?.startsWith("data:image/svg+xml;charset=UTF-8,")))).toBe(true);
});
