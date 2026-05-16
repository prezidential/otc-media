import { supabaseBrowser } from "@/lib/supabase/browser";

/**
 * Supabase OAuth providers we expose on the sign-in / sign-up pages.
 *
 * Note: use `linkedin_oidc` — the legacy `linkedin` provider is deprecated by
 * Supabase. The pre-existing `/api/auth/linkedin/{start,callback}` routes are
 * a separate M1 publishing flow (writes `linkedin_connections`) and are NOT
 * the same as this auth-sign-in flow.
 */
export type OAuthProvider = "google" | "linkedin_oidc";

export type SignInWithProviderOptions = {
  /** Where to send the user after `/api/auth/callback` exchanges the code. */
  next?: string;
};

/**
 * Kick off a Supabase OAuth sign-in. The browser is redirected to the provider,
 * which then redirects back to `/api/auth/callback?code=…`. That route
 * exchanges the code for a session and bounces the user to `next` (default `/`).
 *
 * Must be called from a client component — relies on `window.location.origin`.
 */
export async function signInWithProvider(
  provider: OAuthProvider,
  options: SignInWithProviderOptions = {}
) {
  if (typeof window === "undefined") {
    throw new Error("signInWithProvider must be called from the browser");
  }

  const callback = new URL("/api/auth/callback", window.location.origin);
  if (options.next) callback.searchParams.set("next", options.next);

  const { data, error } = await supabaseBrowser.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: callback.toString(),
      scopes: "openid email profile",
    },
  });

  if (error) throw error;
  return data;
}
