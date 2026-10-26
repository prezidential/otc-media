# Workspace Invites Runbook

Owners add someone to an **existing** workspace by minting a token URL. Opening that URL while signed in as the invited address creates the `workspace_members` row. Sign-in alone does not consume the invite, and `/onboarding` creates a **new** workspace instead of joining one.

There is no Studio members page. The sidebar shows the active workspace and role from `GET /api/me`; it does not list or invite people. Operators use the routes below with a signed-in session cookie.

Schema: `workspace_invites` in `lib/supabase/schema-tenancy.sql`. Email copy: `lib/email/resend.ts`.

## What `role` actually gates

Stored values are `owner`, `editor`, and `viewer`. The API default on create is `editor`.

| Action | Who |
|---|---|
| Create an invite, resend email, remove a member | **Owner only.** Create and delete are Postgres RLS (`workspace_invites_owner_write`, `workspace_members_owner_write`). Resend also checks `role === "owner"` in the route and returns **403** `Owner role required`. |
| Read pending invites (including the raw `token`) | **Any member** (`workspace_invites_member_read`). |
| Write wave-1 rows (`signals`, `editorial_leads`, `issue_drafts`, `content_outlines`, `brand_profiles`, `workspace_settings`, `runs`) | **Any member.** `schema-rls-wave1.sql` is `FOR ALL` via `user_in_workspace`. `editor` and `viewer` are not distinct there. |
| Write wave-2 rows (`brainstorm_sessions`, `brainstorm_messages`, `content_lanes`, `notification_approvals`, `ace_runs`, `podcast_episodes`) | **Owner only** (`schema-rls-wave2.sql`). Other members can `SELECT`. |

No route checks `viewer` separately from `editor`.

## Create an invite

`POST /api/workspaces/{workspaceId}/members`

The path id is the workspace being joined. It does not have to be the caller's `cs_active_workspace` cookie. The caller must be an owner of that workspace or RLS rejects the insert (`42501` → **403**).

```bash
curl -s -X POST http://localhost:3000/api/workspaces/<workspaceId>/members \
  -H "Content-Type: application/json" \
  -b "sb-<project>-auth-token=...; cs_active_workspace=<workspaceId>" \
  -d '{"email":"editor@example.com","role":"editor"}'
```

Body:

- `email` — required, trimmed and lowercased. Must match `.+@.+\..+` or the route returns **400** `Valid email required`.
- `role` — optional. `owner` \| `editor` \| `viewer`. Omitted becomes `editor`. Anything else is **400** `Invalid role`.

**201** body:

```json
{
  "invite": { "id": "…", "email": "editor@example.com", "role": "editor", "token": "…", "expires_at": "…" },
  "url": "http://localhost:3000/api/workspaces/invites/<token>",
  "email": { "sent": false, "error": "Email not configured" }
}
```

Constraints:

- Token is 24 random bytes, `base64url`. Expiry is the column default: **14 days** from insert (`expires_at`). The route does not set either itself.
- `url` is `{Origin header or request protocol+host}/api/workspaces/invites/{token}`. A browser `Origin` that does not match this app mints a link to the wrong host. `curl` with no `Origin` uses the host you called.
- Email is best-effort. Missing `RESEND_API_KEY` or `EMAIL_FROM` returns `email.error: "Email not configured"` and still leaves the row. A Resend failure does not roll the invite back. Share `url` by hand.
- The message always says the link expires in 14 days. That sentence is not computed from `expires_at`.

## List members and pending invites

`GET /api/workspaces/{workspaceId}/members`

**200** `{ members, invites }`.

- Unauthenticated → **401** `Not authenticated`.
- `members`: `{ userId, email, role, createdAt }` ordered by `created_at` ascending. Emails come from `supabaseAdmin().auth.admin.listUsers({ perPage: 200 })`, then filtered to these ids. There is no further page. If the auth user is not in that first page, `email` is `null`.
- `invites`: pending rows only (`accepted_at` is null), newest first, **including `token`**. Any member can call this, so any member can rebuild the join URL.
- A non-member usually gets **200** with empty arrays. RLS hides the rows; the route does not return 403 for "not a member."
- A members-query error is **500**. An invites-query error is ignored and `invites` becomes `[]`.

## Resend

`POST /api/workspaces/{workspaceId}/members/{inviteId}/resend`

Owner-only (**403** otherwise). **404** `Invite not found or already accepted` when the id is wrong, in another workspace, or already accepted.

Does **not** rotate `token`, does **not** extend `expires_at`, and does **not** return the URL. Response is only `{ email: { sent, error } }`. The mail body still says "14 days" even when the row expires sooner.

## Accept

`GET /api/workspaces/invites/{token}`

This is a browser redirect flow, not a JSON API for the happy path.

1. Middleware (`middleware.ts`) treats the path as protected. A signed-out browser is redirected to `/sign-in?next=/api/workspaces/invites/{token}` before the route runs. Email+password sign-in then `router.replace(next)`. OAuth passes the same `next` through `/api/auth/callback`.
2. `/api/workspaces` is on the onboarding allowlist, so a signed-in user with **zero** memberships can still open the invite URL. Every other protected page sends them to `/onboarding`.
3. The route loads the invite with `supabaseAdmin()` (the invitee is not a member yet, so RLS would hide the row). It checks, in order: missing → **404** `Invite not found`; `accepted_at` set → **410** `Invite already used`; `expires_at` in the past → **410** `Invite expired`; invite email ≠ session email (case-insensitive) → **403** with both addresses. If the auth user has no email, the address check is skipped.
4. It upserts `workspace_members` on `(workspace_id, user_id)` and **sets `role` to the invite role**, including when the person was already a member.
5. It stamps `accepted_at`. That update's error is not checked. A failed stamp can leave a membership in place while the invite still looks pending.
6. It sets `cs_active_workspace` to the invited workspace (`httpOnly`, `sameSite=lax`, `path=/`, one year) and redirects to `/`, which redirects to `/dashboard`.

Failures in steps 3–4 are JSON in the browser, not an HTML error page.

Signing up with email confirmation drops `next`: the "confirm your inbox" screen links to `/sign-in` with no query string. After confirming, open the invite URL again. Do not finish `/onboarding` in place of the invite — that creates a second workspace. The invite can still be accepted afterward.

## Remove a member

`DELETE /api/workspaces/{workspaceId}/members?userId={userId}`

- Missing `userId` → **400**.
- If the caller can see exactly one owner and that owner is `userId` → **400** `Cannot remove the last owner`. The row is not deleted.
- A successful delete is `{ ok: true }`. **The same 200 is returned when zero rows match** (unknown user, or a non-owner whose DELETE is filtered by RLS). Treat `ok: true` as "the statement did not error," then re-list members.

## Troubleshooting

- **Invitee landed on onboarding.** They signed in without returning to the token URL. Send the `url` again. Onboarding did not consume the invite.
- **403 with both email addresses.** They are signed in as a different account than `workspace_invites.email`.
- **410 already used / expired.** Create a new invite. Resend will 404 on an accepted row and will not extend an expired one.
- **`email.sent: false` and the row exists.** Share `url` from the create response. Set `RESEND_API_KEY` and `EMAIL_FROM` (`EMAIL_FROM` is the Resend from-address) and call resend.
- **Member `email` is null in the list.** `listUsers` only reads the first 200 auth users.
- **Editor cannot create an invite.** Expected. Only owners pass RLS. The Postgres message is surfaced as **403**, not `Owner role required` (that string is only on resend).
- **Viewer can still edit drafts.** Expected on wave-1 tables. Owner-only writes apply to the wave-2 tables listed above.
