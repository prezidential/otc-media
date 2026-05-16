/**
 * Persistence layer for `linkedin_connections`.
 *
 * Phase 2A M2: tokens are encrypted at rest via pgsodium. Callers in this
 * file work in plaintext only — the encryption boundary lives in the SQL
 * layer (`public.linkedin_encrypt` / `public.linkedin_decrypt`, the
 * `linkedin_connections_decrypted` view, and the
 * `public.upsert_linkedin_connection` RPC defined in
 * `lib/supabase/schema-linkedin.sql`).
 *
 * Routes that previously did `supabase.from("linkedin_connections").upsert(...)`
 * with plaintext tokens should switch to `upsertLinkedInConnection` here;
 * reads that need decrypted tokens should hit the `_decrypted` view through
 * `getLinkedInConnection`.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { LinkedInConnectionRow } from "./types";

export type UpsertLinkedInConnectionInput = {
  workspaceId: string;
  /** LinkedIn `sub` from /v2/userinfo. */
  providerUserId: string;
  /** Plaintext — the RPC encrypts before persisting. */
  accessToken: string;
  /** Plaintext, or null when `offline_access` scope wasn't granted. */
  refreshToken: string | null;
  /** ISO timestamp. */
  expiresAt: string;
  scope: string;
  profileJson: Record<string, unknown>;
};

export type UpsertLinkedInConnectionResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

/**
 * Atomically upsert a LinkedIn connection. Encryption happens server-side
 * inside the `upsert_linkedin_connection` RPC; this function only ferries
 * the plaintext arguments. RLS still applies (the RPC is SECURITY INVOKER)
 * and the RPC pins `user_id := auth.uid()` so the caller cannot write on
 * behalf of another user.
 */
export async function upsertLinkedInConnection(
  supabase: SupabaseClient,
  input: UpsertLinkedInConnectionInput
): Promise<UpsertLinkedInConnectionResult> {
  const { data, error } = await supabase.rpc("upsert_linkedin_connection", {
    p_workspace_id: input.workspaceId,
    p_provider_user_id: input.providerUserId,
    p_access_token: input.accessToken,
    p_refresh_token: input.refreshToken,
    p_expires_at: input.expiresAt,
    p_scope: input.scope,
    p_profile_json: input.profileJson,
  });

  if (error) {
    return { ok: false, error: error.message };
  }
  if (typeof data !== "string") {
    return { ok: false, error: "upsert_linkedin_connection returned no id" };
  }
  return { ok: true, id: data };
}

export type GetLinkedInConnectionOpts = {
  workspaceId: string;
  userId: string;
  providerUserId: string;
};

/**
 * Fetch a single connection by (workspace, user, LinkedIn account) with the
 * access/refresh tokens already decrypted. Reads go through the
 * `linkedin_connections_decrypted` view, which is `security_invoker=true`,
 * so the table's RLS policies still apply.
 */
export async function getLinkedInConnection(
  supabase: SupabaseClient,
  opts: GetLinkedInConnectionOpts
): Promise<LinkedInConnectionRow | null> {
  const { data, error } = await supabase
    .from("linkedin_connections_decrypted")
    .select(
      "id, workspace_id, user_id, provider_user_id, access_token, refresh_token, expires_at, scope, profile_json, created_at, updated_at"
    )
    .eq("workspace_id", opts.workspaceId)
    .eq("user_id", opts.userId)
    .eq("provider_user_id", opts.providerUserId)
    .maybeSingle();

  if (error || !data) return null;
  return data as LinkedInConnectionRow;
}
