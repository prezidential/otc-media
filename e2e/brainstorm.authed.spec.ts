import { test, expect } from "@playwright/test";
import { signIn, hasTestCreds } from "./helpers/auth";

// Authenticated UI test for the Brainstorm chat redesign. Runs only when
// E2E_EMAIL / E2E_PASSWORD are set (see e2e/README.md); skips otherwise.
test.describe("Brainstorm chat (authenticated)", () => {
  test.skip(!hasTestCreds, "Set E2E_EMAIL and E2E_PASSWORD to run authenticated e2e.");

  test("renders the composer and conversation surface", async ({ page }) => {
    await signIn(page);
    await page.goto("/brainstorm");
    // Generic, redesign-agnostic: the chat has a message composer (textarea).
    await expect(page.locator("textarea").first()).toBeVisible();
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: "test-results/screenshots/brainstorm.png", fullPage: true });
  });
});
