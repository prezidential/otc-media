import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { requireWorkspace } from "@/lib/auth/session";
import {
  BEEHIIV_OAUTH_STATE_COOKIE,
  BEEHIIV_OAUTH_VERIFIER_COOKIE,
  completeAuthorization,
} from "@/lib/integrations/beehiiv/oauth";
import { upsertBeehiivConnection } from "@/lib/integrations/beehiiv/store";

/**
 * GET /api/integrations/beehiiv/oauth/callback
 *
 * Beehiiv redirects here with ?code&state. Validate state, exchange the code
 * (PKCE), and persist encrypted tokens, then redirect to /integrations/beehiiv.
 */
const POST_CONNECT_PATH = "/integrations/analytics";

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  const cookieStore = await cookies();
  const expectedState = cookieStore.get(BEEHIIV_OAUTH_STATE_COOKIE)?.value ?? null;
  const codeVerifier = cookieStore.get(BEEHIIV_OAUTH_VERIFIER_COOKIE)?.value ?? null;
  cookieStore.delete(BEEHIIV_OAUTH_STATE_COOKIE);
  cookieStore.delete(BEEHIIV_OAUTH_VERIFIER_COOKIE);

  if (oauthError) return redirect(url.origin, "error", oauthError);
  if (!code || !state) return redirect(url.origin, "error", "missing_code_or_state");
  if (!expectedState || expectedState !== state) return redirect(url.origin, "error", "invalid_state");
  if (!codeVerifier) return redirect(url.origin, "error", "missing_verifier");

  const ctx = await requireWorkspace();
  if (ctx instanceof Response) return ctx;

  let tokens;
  try {
    tokens = await completeAuthorization(url.origin, code, codeVerifier);
  } catch (e) {
    console.error("[beehiiv oauth] token exchange failed", e);
    return redirect(url.origin, "error", `token_exchange_failed:${e instanceof Error ? e.message : ""}`);
  }

  const providerUserId = process.env.BEEHIIV_PUBLICATION_ID ?? "default";
  const expiresAt = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString();

  const res = await upsertBeehiivConnection(ctx.supabase, {
    workspaceId: ctx.workspaceId,
    userId: ctx.userId,
    providerUserId,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? null,
    expiresAt,
    scope: tokens.scope ?? "read",
    profileJson: {},
  });
  if (!res.ok) {
    console.error("[beehiiv oauth] persist failed", res.error);
    return redirect(url.origin, "error", `persist_failed:${res.error}`);
  }

  return redirect(url.origin, "connected");
}

function redirect(origin: string, status: string, reason?: string): NextResponse {
  const dest = new URL(POST_CONNECT_PATH, origin);
  dest.searchParams.set("beehiiv", status);
  if (reason) dest.searchParams.set("reason", reason);
  return NextResponse.redirect(dest);
}
