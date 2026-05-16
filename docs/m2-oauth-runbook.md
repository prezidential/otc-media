# M2 OAuth Sign-In — Operator Runbook

Cornerstone OS supports OAuth sign-in via **Google** and **LinkedIn** through
Supabase Auth. Both providers are configured entirely in the Supabase dashboard;
nothing is required in `.env.local`.

> The pre-existing `LINKEDIN_CLIENT_ID` / `LINKEDIN_CLIENT_SECRET` env vars are
> for the M1 **publishing** OAuth flow (`/api/auth/linkedin/*`), which writes
> `linkedin_connections` rows for posting on a user's behalf. That is a separate
> integration from sign-in and uses a different LinkedIn app + client secret.

## Common steps

1. In Supabase dashboard → **Authentication → URL Configuration**, confirm:
   - **Site URL:** `https://<your-domain>` (or `http://localhost:3000` in dev).
   - **Redirect URLs:** include `https://<your-domain>/api/auth/callback`
     and `http://localhost:3000/api/auth/callback`.
2. The provider-side redirect URI is always:
   `https://<project-ref>.supabase.co/auth/v1/callback`
3. Recommended scopes: `openid email profile` (already requested by
   `lib/auth/oauth.ts`).

## Google

1. Console: <https://console.cloud.google.com/apis/credentials>
2. Create an **OAuth 2.0 Client ID** (type: **Web application**).
3. **Authorized redirect URIs:** add
   `https://<project-ref>.supabase.co/auth/v1/callback`.
4. Copy **Client ID** and **Client secret** into Supabase dashboard →
   **Authentication → Providers → Google**, then toggle the provider **on**.
5. Scopes: `openid email profile` (default; no extra config needed).

## LinkedIn (sign-in / OIDC)

> Use the **`linkedin_oidc`** provider in Supabase, not the legacy `linkedin`
> provider — Supabase deprecated the latter.

1. Console: <https://www.linkedin.com/developers/apps>
2. Create a new app (or reuse a separate app from the publishing one).
3. Under **Products**, request **Sign In with LinkedIn using OpenID Connect**.
4. Under **Auth → Authorized redirect URLs**, add
   `https://<project-ref>.supabase.co/auth/v1/callback`.
5. Copy **Client ID** and **Client Secret** into Supabase dashboard →
   **Authentication → Providers → LinkedIn (OIDC)**, then toggle it **on**.
6. Scopes: `openid email profile`.

## Verifying

1. Visit `/sign-in`, click **Continue with Google** / **Continue with LinkedIn**.
2. The provider redirects back to `/api/auth/callback?code=…`, which exchanges
   the code for a session and redirects to `/`.
3. Middleware then bounces new users (no workspace membership) to `/onboarding`.
