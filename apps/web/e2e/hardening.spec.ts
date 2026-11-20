import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("keeps the full public page within common mobile and desktop widths", async ({ page }) => {
  for (const width of [320, 360, 375, 390, 414, 768, 1024, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      document: document.documentElement.scrollWidth
    }));
    expect(dimensions.document, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(dimensions.viewport);
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
    expect(dimensions.document, `admin gate horizontal overflow at ${width}px`).toBeLessThanOrEqual(dimensions.viewport);
    await expect(page.getByRole("link", { name: "العودة إلى المنصة" })).toBeVisible();
    await expect(page.getByRole("link", { name: "تسجيل الدخول" })).toBeVisible();
  }
});

test("allows switching between login, signup, and password recovery views", async ({ page }) => {
  await page.goto("/?page=publish#publish-account");
  await page.getByRole("button", { name: "ليس لديك حساب؟ أنشئ حساباً" }).click();
  await expect(page.getByRole("heading", { name: "أنشئ حسابك" })).toBeVisible();
  await expect(page.getByLabel("الاسم الكامل")).toBeVisible();
  await expect(page.getByLabel("كلمة المرور")).toHaveAttribute("autocomplete", "new-password");

  await page.getByRole("button", { name: "لديك حساب؟ سجل الدخول" }).click();
  await expect(page.getByRole("heading", { name: "مرحباً بعودتك" })).toBeVisible();
  await expect(page.getByLabel("الاسم الكامل")).toHaveCount(0);

  await page.getByRole("button", { name: "نسيت كلمة المرور؟" }).click();
  await expect(page.getByRole("heading", { name: "استعادة كلمة المرور" })).toBeVisible();
  await expect(page.getByLabel("كلمة المرور")).toHaveCount(0);
  await page.getByRole("button", { name: "العودة إلى الدخول" }).click();
  await expect(page.getByRole("heading", { name: "مرحباً بعودتك" })).toBeVisible();
});

test("keeps cargo publication fields private until a user signs in", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#publish")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "أنشر شحنة" })).toHaveAttribute("href", "?page=publish#publish-account");
  await page.getByRole("link", { name: "أنشر شحنة" }).click();
  await expect(page.getByLabel("البريد الإلكتروني")).toBeVisible();
  await expect(page.locator("#publish")).toHaveCount(0);
});

test("accepts Arabic search input and truck category selection without navigation errors", async ({ page }) => {
  await page.goto("/");
  const origin = page.getByLabel("من مدينة");
  const destination = page.getByLabel("إلى مدينة");
  const truck = page.locator("#search").getByLabel("نوع الشاحنة");
  await origin.fill("الدار البيضاء");
  await destination.fill("مراكش");
  await truck.selectOption({ label: "شاحنة تبريد" });
  await expect(origin).toHaveValue("الدار البيضاء");
  await expect(destination).toHaveValue("مراكش");
  await expect(truck).toHaveValue("شاحنة تبريد");
  await expect(page.getByRole("heading", { name: "الشحنات المتاحة" })).toBeVisible();
});

test("keeps navigation links connected to their intended pages", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "الشحنات", exact: true }).first().click();
  await expect(page.locator("#search")).toBeVisible();
  await expect(page).toHaveURL(/#search$/);
  await page.goto("/");
  await page.getByRole("link", { name: "نشر شحنة", exact: true }).first().click();
  await expect(page).toHaveURL(/[?]page=publish#publish-account$/);
  await expect(page.getByLabel("البريد الإلكتروني")).toBeVisible();
  await page.goto("/");
  await page.getByRole("link", { name: "دخول / حساب جديد", exact: true }).click();
  await expect(page).toHaveURL(/[?]page=publish#publish-account$/);
  await expect(page.getByLabel("البريد الإلكتروني")).toBeVisible();
});

test("meets automated WCAG 2.2 AA checks across the public page", async ({ page }) => {
  await page.goto("/");
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations).toEqual([]);
});


test("admin gate login link returns to the real account form", async ({ page }) => {
  await page.goto("/#admin");
  await page.getByRole("link", { name: "تسجيل الدخول" }).click();
  await expect(page).toHaveURL(/[?]page=publish#publish-account$/);
  await expect(page.getByLabel("البريد الإلكتروني")).toBeVisible();
});
