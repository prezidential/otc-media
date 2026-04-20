import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Two distinct Supabase clients exist in this codebase. Pick the right one for the call site.
 *
 *   supabaseUser()  — Per-request, reads the user JWT from Next.js cookies, runs as
 *                     `authenticated`. Postgres RLS is the authorization boundary.
 *                     Use this in every user-facing route, server component, and action.
 *
 *   supabaseAdmin() — Service-role client. Bypasses RLS. Reserved for system-only
 *                     contexts that have no user JWT (cron, webhooks, the ACE
 *                     orchestrator). Service-role callers MUST filter by workspace_id
 *                     explicitly because RLS will not protect them.
 *
 * The ESLint rule `no-restricted-imports` (see `eslint.config.mjs`) forbids importing
 * `supabaseAdmin` from anywhere outside the allowlist documented in
 * `docs/cornerstone-system-spec-v2.md` §3.16.
 */

export function supabaseAdmin(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false } }
  );
}

/**
 * Per-request Supabase client bound to the user's JWT via Next.js cookies.
 * Every query runs under the `authenticated` role and is filtered by RLS.
 *
 * Returns a Promise so it can be awaited from `route.ts`, server components, and
 * server actions in Next 15+ where `cookies()` is async.
 */
export async function supabaseUser(): Promise<SupabaseClient> {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options as CookieOptions);
            }
          } catch {
            // `cookies()` is read-only in some server contexts (e.g. server components
            // outside of a route handler). Refresh tokens are handled by middleware in
            // those cases, so silently ignoring is safe.
          }
        },
      },
    }
  );
}
