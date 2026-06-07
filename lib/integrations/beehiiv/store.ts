// Persistence for beehiiv_oauth_connections (mirrors lib/linkedin/store.ts).
// Tokens are encrypted at rest; this layer works in plaintext at the
// upsert_beehiiv_connection RPC + beehiiv_oauth_connections_decrypted view boundary.

import type { SupabaseClient } from "@supabase/supabase-js";

export type BeehiivConnectionRow = {
  id: string;
  workspace_id: string;
  user_id: string;
  provider_user_id: string;
  access_token: string;
  refresh_token: string | null;
  expires_at: string;
  scope: string;
  profile_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type UpsertBeehiivConnectionInput = {
  workspaceId: string;
  /** Beehiiv publication id (pub_...). */
  providerUserId: string;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string; // ISO
  scope: string;
  profileJson: Record<string, unknown>;
};

export type UpsertResult = { ok: true; id: string } | { ok: false; error: string };

export async function upsertBeehiivConnection(
  supabase: SupabaseClient,
  input: UpsertBeehiivConnectionInput
): Promise<UpsertResult> {
  const { data, error } = await supabase.rpc("upsert_beehiiv_connection", {
    p_workspace_id: input.workspaceId,
    p_provider_user_id: input.providerUserId,
    p_access_token: input.accessToken,
    p_refresh_token: input.refreshToken,
    p_expires_at: input.expiresAt,
    p_scope: input.scope,
    p_profile_json: input.profileJson,
  });
  if (error) return { ok: false, error: error.message };
  if (typeof data !== "string") return { ok: false, error: "upsert_beehiiv_connection returned no id" };
  return { ok: true, id: data };
}

/** Most-recently-updated Beehiiv connection for (workspace, user), decrypted. */
export async function getBeehiivConnection(
  supabase: SupabaseClient,
  opts: { workspaceId: string; userId: string }
): Promise<BeehiivConnectionRow | null> {
  const { data, error } = await supabase
    .from("beehiiv_oauth_connections_decrypted")
    .select(
      "id, workspace_id, user_id, provider_user_id, access_token, refresh_token, expires_at, scope, profile_json, created_at, updated_at"
    )
    .eq("workspace_id", opts.workspaceId)
    .eq("user_id", opts.userId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data as BeehiivConnectionRow;
}
