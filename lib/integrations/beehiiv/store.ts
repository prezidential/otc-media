// Persistence for beehiiv_oauth_connections.
// Tokens are encrypted in the app layer (AES-256-GCM, lib/integrations/beehiiv/crypto.ts);
// the DB stores opaque text ciphertext. RLS scopes rows to (workspace, user).

import type { SupabaseClient } from "@supabase/supabase-js";
import { encryptToken, decryptToken } from "./crypto";

export type BeehiivConnectionRow = {
  id: string;
  workspace_id: string;
  user_id: string;
  provider_user_id: string;
  access_token: string; // decrypted
  refresh_token: string | null; // decrypted
  expires_at: string;
  scope: string;
  profile_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type UpsertBeehiivConnectionInput = {
  workspaceId: string;
  userId: string;
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
  const { data, error } = await supabase
    .from("beehiiv_oauth_connections")
    .upsert(
      {
        workspace_id: input.workspaceId,
        user_id: input.userId,
        provider_user_id: input.providerUserId,
        access_token: encryptToken(input.accessToken),
        refresh_token: input.refreshToken ? encryptToken(input.refreshToken) : null,
        expires_at: input.expiresAt,
        scope: input.scope,
        profile_json: input.profileJson,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "workspace_id,user_id,provider_user_id" }
    )
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data?.id) return { ok: false, error: "beehiiv connection upsert returned no id" };
  return { ok: true, id: data.id as string };
}

/** Most-recently-updated Beehiiv connection for (workspace, user), tokens decrypted. */
export async function getBeehiivConnection(
  supabase: SupabaseClient,
  opts: { workspaceId: string; userId: string }
): Promise<BeehiivConnectionRow | null> {
  const { data, error } = await supabase
    .from("beehiiv_oauth_connections")
    .select(
      "id, workspace_id, user_id, provider_user_id, access_token, refresh_token, expires_at, scope, profile_json, created_at, updated_at"
    )
    .eq("workspace_id", opts.workspaceId)
    .eq("user_id", opts.userId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  try {
    const row = data as BeehiivConnectionRow;
    return {
      ...row,
      access_token: decryptToken(row.access_token),
      refresh_token: row.refresh_token ? decryptToken(row.refresh_token) : null,
    };
  } catch (e) {
    console.error("[beehiiv] token decrypt failed", e);
    return null;
  }
}
