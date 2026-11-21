import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("serves the Arabic RTL application shell and primary journeys", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Barkoul\.ma/);
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("heading", { name: /كل شحنة تجد طريقها/ })).toBeVisible();
  await expect(page.locator(".entry-primary")).toHaveAttribute("href", "?page=services");
  await expect(page.getByLabel("البريد الإلكتروني")).toBeVisible();
});

test("opens a separate publication page and keeps the cargo form behind sign-in", async ({ page }) => {
  await page.goto("/?page=services");
  await expect(page.locator("#publish")).toHaveCount(0);
  await expect(page.locator("#account")).toHaveCount(0);
  await page.locator(".services-topbar a[href*=" + '"?page=publish#publish-account"' + " ]").click();
  await expect(page).toHaveURL(/[?]page=publish#publish-account$/);
  await expect(page.getByRole("heading", { name: "أنشر شحنتك" })).toBeVisible();
  await expect(page.getByLabel("البريد الإلكتروني")).toBeVisible();
  await expect(page.locator("#publish")).toHaveCount(0);
});

test("does not expose publisher-role refresh to signed-out visitors", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "إعادة التحقق من الصلاحية" })).toHaveCount(0);
});

test("keeps search on the homepage and account controls on the publication page", async ({ page }) => {
  await page.goto("/?page=services");
  await expect(page.getByLabel("من مدينة")).toBeVisible();
  await expect(page.getByLabel("إلى مدينة")).toBeVisible();
  await expect(page.locator("#search").getByLabel("نوع الشاحنة")).toBeVisible();
  await expect(page.getByLabel("البريد الإلكتروني")).toHaveCount(0);
  await page.goto("/?page=publish#publish-account");
  await expect(page.getByLabel("البريد الإلكتروني")).toBeVisible();
  await expect(page.getByLabel("كلمة المرور")).toBeVisible();
});

test("does not introduce horizontal scrolling on a narrow mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/?page=services");
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
