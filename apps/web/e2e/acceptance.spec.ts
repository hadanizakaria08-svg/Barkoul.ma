import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("serves the Arabic RTL application shell and primary journeys", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Barkoul\.ma/);
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: "أبحث عن شحنة" })).toHaveAttribute("href", "#search");
  await expect(page.getByRole("link", { name: "أنشر شحنة" })).toHaveAttribute("href", "#publish");
});

test("keeps cargo publication unavailable to anonymous visitors", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "نشر الشحنة" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "تسجيل الدخول" })).toBeDisabled();
  await expect(page.getByText(/الاتصال بقاعدة البيانات غير مضبوط/)).toBeVisible();
});

test("exposes labelled search and account controls", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByLabel("من مدينة")).toBeVisible();
  await expect(page.getByLabel("إلى مدينة")).toBeVisible();
  await expect(page.getByLabel("نوع الشاحنة")).toBeVisible();
  await expect(page.getByLabel("البريد الإلكتروني")).toBeVisible();
  await expect(page.getByLabel("كلمة المرور")).toBeVisible();
});

test("does not introduce horizontal scrolling on a narrow mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/");
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth
  }));
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);
});

test("meets automated WCAG 2.2 AA accessibility checks on the initial screen", async ({ page }) => {
  await page.goto("/");
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations).toEqual([]);
});
