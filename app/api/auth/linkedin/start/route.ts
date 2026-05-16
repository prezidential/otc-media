import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { requireWorkspace } from "@/lib/auth/session";
import {
  LINKEDIN_STATE_COOKIE,
  getAuthorizationUrl,
  getLinkedInConfig,
} from "@/lib/linkedin/oauth";

/**
 * GET /api/auth/linkedin/start
 *
 * Kicks off the LinkedIn OAuth flow:
 *   1. Verify the caller is authenticated and has an active workspace.
 *   2. Mint a `state` (random UUID), set it in an httpOnly short-lived cookie.
 *   3. Redirect to LinkedIn's authorization URL.
 *
 * Returns 503 when LINKEDIN_* env vars are not configured — LinkedIn OAuth is
 * optional in M1.
 */

export async function GET(req: NextRequest) {
  const config = getLinkedInConfig();
  if (!config) {
    return NextResponse.json(
      { error: "LinkedIn OAuth not configured" },
      { status: 503 }
    );
  }

  const ctx = await requireWorkspace();
  if (ctx instanceof Response) return ctx;

  const redirectUri =
    config.redirectUri || `${req.nextUrl.origin}/api/auth/linkedin/callback`;

  const state = crypto.randomUUID();

  const authorizationUrl = getAuthorizationUrl({
    workspaceId: ctx.workspaceId,
    state,
    redirectUri,
  });

  const response = NextResponse.redirect(authorizationUrl);

  // httpOnly cookie scoped to the callback path. SameSite=lax is required so
  // the cookie survives the cross-site redirect back from linkedin.com.
  const cookieStore = await cookies();
  cookieStore.set(LINKEDIN_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api/auth/linkedin",
    maxAge: 600,
  });

  return response;
}
