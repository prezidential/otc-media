// lib/integrations/beehiiv/oauth.ts
//
// OAuth 2.1 (auth-code + PKCE + DCR) for the Beehiiv MCP server, built on the
// @modelcontextprotocol/sdk auth helpers. The interactive flow lives in
// app/api/integrations/beehiiv/oauth/{start,callback}/route.ts; this module
// provides: dynamic client registration (persisted per origin), authorization
// URL building, code exchange, refresh, and a getAccessToken() that returns a
// fresh token for data calls (refreshing when near expiry).

import {
  discoverAuthorizationServerMetadata,
  registerClient,
  startAuthorization,
  exchangeAuthorization,
  refreshAuthorization,
} from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  OAuthTokens,
  OAuthClientInformation,
  AuthorizationServerMetadata,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/server";
import { upsertBeehiivConnection, getBeehiivConnection } from "./store";

/** Beehiiv MCP authorization server (issuer) + resource indicator. */
export const BEEHIIV_ISSUER = "https://mcp.beehiiv.com";
const RESOURCE = new URL(BEEHIIV_ISSUER); // protected-resource metadata `resource`
const SCOPE = "read";
export const BEEHIIV_OAUTH_STATE_COOKIE = "beehiiv_oauth_state";
export const BEEHIIV_OAUTH_VERIFIER_COOKIE = "beehiiv_oauth_verifier";

export function beehiivRedirectUri(origin: string): string {
  return `${origin}/api/integrations/beehiiv/oauth/callback`;
}

let cachedMetadata: AuthorizationServerMetadata | undefined;
async function metadata(): Promise<AuthorizationServerMetadata> {
  if (cachedMetadata) return cachedMetadata;
  const m = await discoverAuthorizationServerMetadata(BEEHIIV_ISSUER);
  if (!m) throw new Error("Beehiiv MCP: failed to discover OAuth metadata");
  cachedMetadata = m;
  return m;
}

/**
 * Get the DCR client for this origin, registering (and persisting) it once.
 * Registered as a public PKCE client (token_endpoint_auth_method: "none").
 */
export async function getOrRegisterClient(origin: string): Promise<OAuthClientInformation> {
  const admin = supabaseAdmin();
  const { data: existing } = await admin
    .from("mcp_oauth_clients")
    .select("client_id, client_secret")
    .eq("issuer", BEEHIIV_ISSUER)
    .eq("redirect_origin", origin)
    .maybeSingle();
  if (existing?.client_id) {
    return { client_id: existing.client_id, client_secret: existing.client_secret ?? undefined };
  }

  const full = await registerClient(BEEHIIV_ISSUER, {
    metadata: await metadata(),
    clientMetadata: {
      client_name: "Cornerstone OS",
      redirect_uris: [beehiivRedirectUri(origin)],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      scope: SCOPE,
    },
  });

  await admin.from("mcp_oauth_clients").upsert(
    {
      issuer: BEEHIIV_ISSUER,
      redirect_origin: origin,
      client_id: full.client_id,
      client_secret: full.client_secret ?? null,
      registration_json: full as unknown as Record<string, unknown>,
    },
    { onConflict: "issuer,redirect_origin" }
  );

  return { client_id: full.client_id, client_secret: full.client_secret ?? undefined };
}

/** Build the Beehiiv authorize URL (PKCE). Caller stores state + verifier in cookies. */
export async function beginAuthorization(
  origin: string,
  state: string
): Promise<{ authorizationUrl: URL; codeVerifier: string }> {
  const clientInformation = await getOrRegisterClient(origin);
  return startAuthorization(BEEHIIV_ISSUER, {
    metadata: await metadata(),
    clientInformation,
    redirectUrl: beehiivRedirectUri(origin),
    scope: SCOPE,
    state,
    resource: RESOURCE,
  });
}

/** Exchange an authorization code for tokens. */
export async function completeAuthorization(
  origin: string,
  authorizationCode: string,
  codeVerifier: string
): Promise<OAuthTokens> {
  const clientInformation = await getOrRegisterClient(origin);
  return exchangeAuthorization(BEEHIIV_ISSUER, {
    metadata: await metadata(),
    clientInformation,
    authorizationCode,
    codeVerifier,
    redirectUri: beehiivRedirectUri(origin),
    resource: RESOURCE,
  });
}

/** Refresh tokens using a stored refresh_token. */
export async function refreshTokens(origin: string, refreshToken: string): Promise<OAuthTokens> {
  const clientInformation = await getOrRegisterClient(origin);
  return refreshAuthorization(BEEHIIV_ISSUER, {
    metadata: await metadata(),
    clientInformation,
    refreshToken,
    resource: RESOURCE,
  });
}

export type BeehiivOAuthCtx = {
  workspaceId: string;
  userId: string;
  supabase: SupabaseClient;
  /** App origin, used for refresh client lookup. Defaults to BEEHIIV_ISSUER-derived. */
  origin?: string;
};

/**
 * Return a valid Beehiiv MCP access token for the workspace/user, refreshing
 * when within 60s of expiry. Returns null when there is no OAuth connection.
 */
export async function getBeehiivAccessToken(ctx: BeehiivOAuthCtx): Promise<string | null> {
  const conn = await getBeehiivConnection(ctx.supabase, {
    workspaceId: ctx.workspaceId,
    userId: ctx.userId,
  });
  if (!conn) return null;

  const expMs = Date.parse(conn.expires_at);
  const fresh = Number.isFinite(expMs) && expMs - Date.now() > 60_000;
  if (fresh) return conn.access_token;

  if (!conn.refresh_token) return conn.access_token; // can't refresh; try existing
  const origin = ctx.origin ?? BEEHIIV_ISSUER;
  const tokens = await refreshTokens(origin, conn.refresh_token);
  const expiresAt = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString();
  await upsertBeehiivConnection(ctx.supabase, {
    workspaceId: ctx.workspaceId,
    providerUserId: conn.provider_user_id,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? conn.refresh_token,
    expiresAt,
    scope: tokens.scope ?? conn.scope,
    profileJson: conn.profile_json,
  });
  return tokens.access_token;
}
