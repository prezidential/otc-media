import { defineConfig } from "@playwright/test";

// Browser-based UI tests. Runs against a local dev server (auto-started below)
// or an external URL via E2E_BASE_URL (e.g. a Vercel preview).
// Authenticated specs (*.authed.spec.ts) run only when E2E_EMAIL / E2E_PASSWORD
// are set; otherwise they skip. See e2e/README.md.

const PORT = Number(process.env.E2E_PORT || 3940);
const baseURL = process.env.E2E_BASE_URL || `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./test-results/e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  use: {
    baseURL,
    viewport: { width: 1280, height: 860 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  // Auto-start `next dev` unless pointing at an external URL.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npm run dev -- -p ${PORT}`,
        url: `${baseURL}/sign-in`,
        timeout: 120_000,
        reuseExistingServer: !process.env.CI,
      },
});
