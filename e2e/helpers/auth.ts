import { type Page } from "@playwright/test";

export const hasTestCreds = Boolean(process.env.E2E_EMAIL && process.env.E2E_PASSWORD);

/**
 * Sign in through the real Supabase sign-in form using E2E_EMAIL / E2E_PASSWORD.
 * No auth bypass — it drives the actual login UI, so authed e2e exercises the
 * same path a real creator does. Requires a dedicated test user in the workspace.
 */
export async function signIn(page: Page): Promise<void> {
  const email = process.env.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD;
  if (!email || !password) throw new Error("E2E_EMAIL / E2E_PASSWORD are required for authenticated e2e.");

  await page.goto("/sign-in");
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.locator('button[type="submit"]').first().click();
  // Land anywhere off the sign-in page (dashboard or onboarding).
  await page.waitForURL((u) => !u.pathname.startsWith("/sign-in"), { timeout: 20_000 });
}
