import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { requireWorkspace } from "@/lib/auth/session";
import {
  BEEHIIV_OAUTH_STATE_COOKIE,
  BEEHIIV_OAUTH_VERIFIER_COOKIE,
  beginAuthorization,
} from "@/lib/integrations/beehiiv/oauth";

/**
 * GET /api/integrations/beehiiv/oauth/start
 *
 * Begins the Beehiiv MCP OAuth flow (auth-code + PKCE, dynamic client
 * registration). Stores `state` + PKCE `code_verifier` in short-lived httpOnly
 * cookies and redirects to Beehiiv's /authorize.
 */
export async function GET(req: NextRequest) {
  if (!process.env.BEEHIIV_MCP_SERVER_URL) {
    return NextResponse.json({ error: "Beehiiv MCP not configured (set BEEHIIV_MCP_SERVER_URL)" }, { status: 503 });
  }

  const ctx = await requireWorkspace();
  if (ctx instanceof Response) return ctx;

  const origin = req.nextUrl.origin;
  const state = crypto.randomUUID();

  let authorizationUrl: URL;
  let codeVerifier: string;
  try {
    ({ authorizationUrl, codeVerifier } = await beginAuthorization(origin, state));
  } catch (e) {
    return NextResponse.json(
      { error: `Beehiiv OAuth init failed: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 }
    );
  }

  const response = NextResponse.redirect(authorizationUrl);
  const cookieStore = await cookies();
  const opts = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/api/integrations/beehiiv/oauth",
    maxAge: 600,
  };
  cookieStore.set(BEEHIIV_OAUTH_STATE_COOKIE, state, opts);
  cookieStore.set(BEEHIIV_OAUTH_VERIFIER_COOKIE, codeVerifier, opts);
  return response;
}
