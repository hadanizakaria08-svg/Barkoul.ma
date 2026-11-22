import { expect, test } from "@playwright/test";

test("does not redirect to the preserved legacy interface when the new app bundle fails", async ({ page }) => {
  await page.route("**/assets/app.js", (route) => route.abort("failed"));

  await page.goto("/");

  await expect(page).not.toHaveURL(/\\/legacy\\/index\\.html/);
  await expect(page).toHaveTitle(/Barkoul\\.ma/);
});

test("the preserved legacy page remains directly accessible", async ({ page }) => {
  await page.goto("/legacy/index.html?fallback=runtime-error");

  await expect(page).toHaveURL(/\\/legacy\\/index\\.html\\?fallback=runtime-error$/);
  await expect(page).toHaveTitle(/Barkoul\\.ma/);
  await expect(page.locator("body")).toContainText("نقل بضائعك أصبح أسهل");
});
