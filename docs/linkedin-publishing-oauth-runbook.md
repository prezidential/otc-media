# LinkedIn Publishing OAuth — Operator Runbook

This is the **M1 publishing** connection: it stores per-user tokens so Cornerstone can later post on a member's behalf. It is **not** "Continue with LinkedIn" sign-in.

| Flow | Routes | Credentials | Result |
|------|--------|-------------|--------|
| **Publishing OAuth (this doc)** | `GET /api/auth/linkedin/start` → LinkedIn → `GET /api/auth/linkedin/callback` | `.env.local` `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, `LINKEDIN_REDIRECT_URI` | Row in `linkedin_connections` (tokens encrypted at rest) |
| **Sign-in OAuth** | `/sign-in` / `/sign-up` → `signInWithProvider("linkedin_oidc")` → `/api/auth/callback` | Supabase dashboard **Authentication → Providers → LinkedIn (OIDC)** | Supabase auth user |

Use a **separate LinkedIn developer app** (or at least a separate client secret) from sign-in. Sign-in setup: [`docs/m2-oauth-runbook.md`](m2-oauth-runbook.md). Spec: `docs/cornerstone-system-spec.md` §3.8 / §3.16.

## What is shipped vs not

**Shipped**

- Connect + persist: start/callback routes, `lib/linkedin/oauth.ts`, `lib/linkedin/store.ts`
- Tables + RLS: `lib/supabase/schema-linkedin.sql` (`linkedin_connections`, `linkedin_drafts`)
- Encryption: `lib/supabase/schema-linkedin-crypto.sql` (apply **before** the tables file)
- `w_member_social` requested at connect time so Phase 3 posting does not need a second consent

**Not shipped (Phase 3 / agent-plan Phase 5)**

- No Connect button on `/integrations` (that page lists Beehiiv + Supergrow MCP plugins only)
- No `/onboarding` LinkedIn step
- No connection-status API; `getLinkedInConnection()` exists but no route calls it
- No generate / regenerate / list / publish (`/api/linkedin/*` does not exist)
- No Issues LinkedIn tab; Issues **social snippets** (`linkedin_teaser`) are copy-paste content products, not this OAuth
- No token-refresh helper (Beehiiv MCP OAuth refreshes; LinkedIn publishing does not)
- `/dashboard` does **not** read `?linkedin=` — success/error query params are silent

## One-time setup

1. Apply SQL in the Supabase editor, in order:
   1. Tenancy + RLS (if not already): `schema-tenancy.sql`, then wave-1 / wave-2
   2. `lib/supabase/schema-linkedin-crypto.sql` — `pgsodium` key `linkedin_tokens_v1` + `linkedin_encrypt` / `linkedin_decrypt`
   3. `lib/supabase/schema-linkedin.sql` — tables, decrypted view, `upsert_linkedin_connection` RPC
2. LinkedIn Developer Portal (<https://www.linkedin.com/developers/apps>):
   - Products: **Sign In with LinkedIn using OpenID Connect** and **Share on LinkedIn** (needed for `w_member_social`)
   - Auth → Authorized redirect URLs: exactly `LINKEDIN_REDIRECT_URI` (local default `http://localhost:3000/api/auth/linkedin/callback`)
3. `.env.local`:

```
LINKEDIN_CLIENT_ID=your-linkedin-client-id
LINKEDIN_CLIENT_SECRET=your-linkedin-client-secret
LINKEDIN_REDIRECT_URI=http://localhost:3000/api/auth/linkedin/callback
```

Omit any of the three → both routes return **503** `{ "error": "LinkedIn OAuth not configured" }` **before** auth is checked.

## Connect (operator path)

There is no studio button. From a **signed-in browser session** with an active workspace:

1. Confirm `cs_active_workspace` is the workspace you want the row bound to (sidebar switcher). OAuth `state` is a random UUID cookie; it does **not** encode `workspace_id`. Callback uses `requireWorkspace()`.
2. Visit:

```
http://localhost:3000/api/auth/linkedin/start
```

3. LinkedIn authorizes `openid profile email w_member_social`.
4. Callback exchanges the code, loads `/v2/userinfo`, upserts via `upsert_linkedin_connection` (RPC encrypts; pins `user_id := auth.uid()`).
5. Redirect: `/dashboard?linkedin=connected` or `/dashboard?linkedin=error&reason=...`.

Reconnect of the same LinkedIn account (`provider_user_id` = OIDC `sub`) upserts the unique `(workspace_id, user_id, provider_user_id)` row. There is **no disconnect** route.

### Callback `reason` values

| `reason` | Cause |
|----------|--------|
| LinkedIn `error` query value | User denied / LinkedIn returned `?error=` |
| `missing_code_or_state` | Callback missing `code` or `state` |
| `invalid_state` | `linkedin_oauth_state` cookie missing, expired (10 min), or mismatch |
| `token_exchange_failed` | `/oauth/v2/accessToken` failed |
| `profile_fetch_failed` | `/v2/userinfo` failed or missing `sub` |
| `persist_failed` | `upsert_linkedin_connection` RPC error (often SQL not applied, or RLS) |

If the session expired mid-flow, callback returns **JSON 401/403** instead of a dashboard redirect (`/api/auth/*` is a public middleware prefix, so the handler's `requireWorkspace()` is the gate).

## Codepaths

| Path | Role |
|------|------|
| `app/api/auth/linkedin/start/route.ts` | 503 if unconfigured; else `requireWorkspace()`, set httpOnly `linkedin_oauth_state` (`path=/api/auth/linkedin`, `SameSite=lax`, `maxAge=600`), redirect to LinkedIn |
| `app/api/auth/linkedin/callback/route.ts` | Verify state, exchange code, fetch profile, upsert, redirect `/dashboard?linkedin=` |
| `lib/linkedin/oauth.ts` | Config, authorize URL, token exchange, `/v2/userinfo` |
| `lib/linkedin/store.ts` | `upsertLinkedInConnection` / `getLinkedInConnection` (plaintext at the view/RPC boundary) |
| `lib/linkedin/types.ts` | Row types; `LinkedInDraftObject` is a placeholder (`body?`, `working_title?`, `meta?`) |
| `middleware.ts` | `/api/auth` is public — publishing OAuth is not session-gated at the edge |

## Constraints

- **Per-user, not workspace-shared.** Members can `SELECT` connections in the workspace; only `user_id = auth.uid()` can write. Tokens are personal.
- **Active workspace at callback time** is what gets stored. Switching workspaces in another tab during consent writes to the workspace `requireWorkspace()` resolves on return.
- **`refresh_token` may be null.** Scopes do not include `offline_access`. Nothing in `lib/linkedin/` refreshes expiry. Re-run `/start` when tokens die.
- **`linkedin_drafts` is unused.** RLS is ready (`draft` / `reviewed` / `published` / `dismissed`); no API writes rows yet.
- **LLM role `linkedin`** exists in `lib/llm/provider.ts` (`LLM_LINKEDIN`) for the future draft engine; publishing OAuth does not call it.

## Troubleshooting

- **503 LinkedIn OAuth not configured:** missing `LINKEDIN_*` env; restart `next dev` after editing `.env.local`.
- **401 Not authenticated / 403 No workspaces:** hit `/start` while signed in, after onboarding.
- **`invalid_state`:** cookie is path-scoped to `/api/auth/linkedin` and lasts 10 minutes; `LINKEDIN_REDIRECT_URI` must be this app's callback, not the Supabase Auth callback (`https://<project-ref>.supabase.co/auth/v1/callback` is sign-in only).
- **`persist_failed`:** crypto SQL before table SQL; `pgsodium` enabled; RPC granted to `authenticated`.
- **Dashboard looks unchanged after connect:** expected — no UI banner. Confirm in SQL via `linkedin_connections` (ciphertext) or `linkedin_connections_decrypted` (plaintext, RLS).
- **Confused with Beehiiv / Supergrow "LinkedIn analytics":** `/integrations` + Supergrow MCP `get_linkedin_analytics` do not use `linkedin_connections`.
