import { expect, test } from "@playwright/test";

test("automatically opens the preserved legacy interface when the new app bundle fails", async ({ page }) => {
  await page.route("**/assets/app.js", (route) => route.abort("failed"));

  await page.goto("/");

  await expect(page).toHaveURL(/\/legacy\/index\.html\?fallback=runtime-error$/);
  await expect(page).toHaveTitle(/Barkoul\.ma/);
  await expect(page.locator("body")).toContainText("نقل بضائعك أصبح أسهل");
});

test("the legacy fallback page remains accessible and does not redirect again", async ({ page }) => {
  await page.goto("/legacy/index.html?fallback=runtime-error");

  await expect(page).toHaveURL(/\/legacy\/index\.html\?fallback=runtime-error$/);
  await expect(page).toHaveTitle(/Barkoul\.ma/);
  await expect(page.locator("body")).toContainText("نقل بضائعك أصبح أسهل");
});
