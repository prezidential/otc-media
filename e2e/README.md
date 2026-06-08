# Browser UI tests (Playwright)

Real-browser tests that drive the app in a headless Chromium (its own instance —
never your open browser). Used to actually look at UI changes, not just test them
programmatically.

## Run

```bash
# Public smoke (no auth) — boots the dev server automatically, screenshots sign-in:
npm run e2e -- sign-in.public.spec.ts

# Everything (authed specs skip unless test creds are set):
npm run e2e
```

Screenshots land in `test-results/screenshots/`. The HTML report: `npm run e2e:report`.

## Authenticated tests

`*.authed.spec.ts` sign in through the real Supabase form (no auth bypass), so they
need a dedicated **test user** that belongs to a workspace. Provide credentials via env:

```bash
E2E_EMAIL="test@example.com" E2E_PASSWORD="…" npm run e2e
```

Without those vars, authenticated specs **skip** (they don't fail), so the suite is
safe to run anywhere.

## Against a deployed preview

Point the tests at a running URL (e.g. a Vercel preview) instead of a local server:

```bash
E2E_BASE_URL="https://<preview>.vercel.app" E2E_EMAIL=… E2E_PASSWORD=… npm run e2e
```

## Notes
- The dev server is auto-started on port `E2E_PORT` (default 3940) and reused if already running.
- `test-results/` and `playwright-report/` are gitignored.
- Browsers install once via `npx playwright install chromium`.
