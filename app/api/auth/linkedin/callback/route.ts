import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { requireWorkspace } from "@/lib/auth/session";
import {
  LINKEDIN_STATE_COOKIE,
  exchangeCodeForTokens,
  fetchProfile,
  getLinkedInConfig,
} from "@/lib/linkedin/oauth";
import { upsertLinkedInConnection } from "@/lib/linkedin/store";

/**
 * GET /api/auth/linkedin/callback
 *
 * LinkedIn redirects here with `?code=...&state=...` after the user authorizes.
 * We:
 *   1. Validate the `state` matches the cookie set by `/start` (and clear it).
 *   2. Exchange the code for tokens.
 *   3. Fetch the user's `/v2/userinfo` profile snapshot.
 *   4. Upsert into `linkedin_connections` via supabaseUser (RLS enforces that
 *      the caller is a member of the active workspace and is writing their own
 *      row — see `linkedin_connections_self_write` in schema-linkedin.sql).
 *   5. Redirect to the post-connect landing page.
 *
 * On any error we redirect (not 500) so the UI can surface a friendly message
 * via `?status=error&reason=...`.
 */

const POST_CONNECT_PATH = "/dashboard";

export async function GET(req: NextRequest) {
  const config = getLinkedInConfig();
  if (!config) {
    return NextResponse.json(
      { error: "LinkedIn OAuth not configured" },
      { status: 503 }
    );
  }

  const url = req.nextUrl;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  const cookieStore = await cookies();
  const expectedState = cookieStore.get(LINKEDIN_STATE_COOKIE)?.value ?? null;
  // Clear the state cookie regardless of outcome — it's single-use.
  cookieStore.delete(LINKEDIN_STATE_COOKIE);

  if (oauthError) {
    return redirectWithStatus(url.origin, "error", oauthError);
  }
  if (!code || !state) {
    return redirectWithStatus(url.origin, "error", "missing_code_or_state");
  }
  if (!expectedState || expectedState !== state) {
    return redirectWithStatus(url.origin, "error", "invalid_state");
  }

  const ctx = await requireWorkspace();
  if (ctx instanceof Response) return ctx;

  const redirectUri =
    config.redirectUri || `${url.origin}/api/auth/linkedin/callback`;

  const tokenRes = await exchangeCodeForTokens({ code, redirectUri });
  if (!tokenRes.ok) {
    return redirectWithStatus(url.origin, "error", "token_exchange_failed");
  }

  const profileRes = await fetchProfile(tokenRes.data.accessToken);
  if (!profileRes.ok) {
    return redirectWithStatus(url.origin, "error", "profile_fetch_failed");
  }

  const expiresAt = new Date(Date.now() + tokenRes.data.expiresIn * 1000).toISOString();

  // M2: tokens are encrypted at rest. The RPC wraps the upsert and runs
  // `linkedin_encrypt(...)` server-side; RLS on `linkedin_connections` still
  // applies (the RPC is SECURITY INVOKER and pins user_id := auth.uid()).
  const upsertRes = await upsertLinkedInConnection(ctx.supabase, {
    workspaceId: ctx.workspaceId,
    providerUserId: profileRes.data.providerUserId,
    accessToken: tokenRes.data.accessToken,
    refreshToken: tokenRes.data.refreshToken,
    expiresAt,
    scope: tokenRes.data.scope,
    profileJson: profileRes.data.profileJson,
  });

  if (!upsertRes.ok) {
    return redirectWithStatus(url.origin, "error", "persist_failed");
  }

  return redirectWithStatus(url.origin, "connected");
}

function redirectWithStatus(origin: string, status: string, reason?: string): NextResponse {
  const dest = new URL(POST_CONNECT_PATH, origin);
  dest.searchParams.set("linkedin", status);
  if (reason) dest.searchParams.set("reason", reason);
  return NextResponse.redirect(dest);
}
