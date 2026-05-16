/**
 * LinkedIn OAuth 2.0 helpers (Phase 2A M1).
 *
 * Env vars (all required at route call time; routes return 503 when missing):
 *   LINKEDIN_CLIENT_ID
 *   LINKEDIN_CLIENT_SECRET
 *   LINKEDIN_REDIRECT_URI  (e.g. http://localhost:3000/api/auth/linkedin/callback)
 *
 * Scopes:
 *   openid profile email w_member_social
 *   - openid/profile/email come from LinkedIn's "Sign In with LinkedIn using
 *     OpenID Connect" product and back `/v2/userinfo`.
 *   - w_member_social is required to post on the member's behalf (used by the
 *     Phase 3 LinkedIn Draft Engine; requested at connect time so we don't
 *     have to re-authorize later).
 */

import type { LinkedInProfileResult, LinkedInTokenResult } from "./types";

const AUTHORIZATION_URL = "https://www.linkedin.com/oauth/v2/authorization";
const TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";
const USERINFO_URL = "https://api.linkedin.com/v2/userinfo";

export const LINKEDIN_OAUTH_SCOPES = ["openid", "profile", "email", "w_member_social"] as const;

/** Short-lived httpOnly cookie used to verify `state` on callback. */
export const LINKEDIN_STATE_COOKIE = "linkedin_oauth_state";

export type LinkedInConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

/**
 * Read LinkedIn env vars. Returns `null` when any required value is missing so
 * the caller can produce a 503 (rather than crashing on `process.env.X!`).
 */
export function getLinkedInConfig(): LinkedInConfig | null {
  const clientId = process.env.LINKEDIN_CLIENT_ID;
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
  const redirectUri = process.env.LINKEDIN_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) return null;
  return { clientId, clientSecret, redirectUri };
}

export type AuthorizationUrlOpts = {
  workspaceId: string;
  state: string;
  redirectUri: string;
};

/** Build the LinkedIn authorization URL. The caller is responsible for storing
 *  `state` in a short-lived httpOnly cookie and verifying it on callback. */
export function getAuthorizationUrl(opts: AuthorizationUrlOpts): string {
  const clientId = process.env.LINKEDIN_CLIENT_ID ?? "";
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: opts.redirectUri,
    state: opts.state,
    scope: LINKEDIN_OAUTH_SCOPES.join(" "),
  });
  return `${AUTHORIZATION_URL}?${params.toString()}`;
}

export type LinkedInError = {
  ok: false;
  status: number;
  error: string;
};

export type LinkedInOk<T> = {
  ok: true;
  data: T;
};

export type LinkedInResult<T> = LinkedInOk<T> | LinkedInError;

export type ExchangeCodeOpts = {
  code: string;
  redirectUri: string;
};

/**
 * Exchange an authorization code for an access token. Returns a clean result
 * envelope rather than throwing; route handlers translate the error into a
 * redirect with `?status=error&reason=...`.
 */
export async function exchangeCodeForTokens(
  opts: ExchangeCodeOpts
): Promise<LinkedInResult<LinkedInTokenResult>> {
  const config = getLinkedInConfig();
  if (!config) {
    return { ok: false, status: 503, error: "LinkedIn OAuth not configured" };
  }

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: opts.code,
    redirect_uri: opts.redirectUri,
    client_id: config.clientId,
    client_secret: config.clientSecret,
  });

  let res: Response;
  try {
    res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: body.toString(),
    });
  } catch (e) {
    return {
      ok: false,
      status: 502,
      error: `LinkedIn token exchange network error: ${(e as Error).message}`,
    };
  }

  if (!res.ok) {
    const text = await safeText(res);
    return {
      ok: false,
      status: res.status,
      error: `LinkedIn token exchange failed (${res.status}): ${text}`,
    };
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return { ok: false, status: 502, error: "LinkedIn token response was not JSON" };
  }

  const j = json as {
    access_token?: unknown;
    refresh_token?: unknown;
    expires_in?: unknown;
    scope?: unknown;
  };
  if (typeof j.access_token !== "string" || typeof j.expires_in !== "number") {
    return { ok: false, status: 502, error: "LinkedIn token response missing fields" };
  }

  return {
    ok: true,
    data: {
      accessToken: j.access_token,
      refreshToken: typeof j.refresh_token === "string" ? j.refresh_token : null,
      expiresIn: j.expires_in,
      scope: typeof j.scope === "string" ? j.scope : LINKEDIN_OAUTH_SCOPES.join(" "),
    },
  };
}

/**
 * Fetch the profile snapshot from /v2/userinfo. Uses OIDC `sub` as the stable
 * `provider_user_id` we persist alongside the tokens.
 */
export async function fetchProfile(
  accessToken: string
): Promise<LinkedInResult<LinkedInProfileResult>> {
  let res: Response;
  try {
    res = await fetch(USERINFO_URL, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });
  } catch (e) {
    return {
      ok: false,
      status: 502,
      error: `LinkedIn userinfo network error: ${(e as Error).message}`,
    };
  }

  if (!res.ok) {
    const text = await safeText(res);
    return {
      ok: false,
      status: res.status,
      error: `LinkedIn userinfo failed (${res.status}): ${text}`,
    };
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return { ok: false, status: 502, error: "LinkedIn userinfo response was not JSON" };
  }

  const j = json as { sub?: unknown };
  if (typeof j.sub !== "string" || j.sub.length === 0) {
    return { ok: false, status: 502, error: "LinkedIn userinfo missing `sub`" };
  }

  return {
    ok: true,
    data: {
      providerUserId: j.sub,
      profileJson: json as Record<string, unknown>,
    },
  };
}

async function safeText(res: Response): Promise<string> {
  try {
    const t = await res.text();
    return t.slice(0, 500);
  } catch {
    return "<unreadable body>";
  }
}
