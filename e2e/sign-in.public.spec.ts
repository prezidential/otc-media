import { test, expect } from "@playwright/test";

// Public smoke test: confirms the app boots and the sign-in screen renders.
// No auth required, so this runs everywhere (incl. CI without test creds).
test("sign-in page renders", async ({ page }) => {
  await page.goto("/sign-in");
  await expect(page).toHaveURL(/sign-in/);
  await expect(page.locator('input[type="email"]')).toBeVisible();
  await expect(page.locator('input[type="password"]')).toBeVisible();
  await page.screenshot({ path: "test-results/screenshots/sign-in.png", fullPage: true });
});
