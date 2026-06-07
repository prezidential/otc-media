-- Beehiiv MCP OAuth — connection tokens + DCR client registry.
--
-- Tokens are encrypted in the APPLICATION layer (AES-256-GCM via
-- lib/integrations/beehiiv/crypto.ts, key = BEEHIIV_TOKEN_ENC_KEY), so the DB
-- stores opaque ciphertext as `text`. This avoids the pgsodium EXECUTE-permission
-- issues seen with the column-encryption approach. RLS still scopes rows to the
-- owning (workspace, user).
--
-- Apply order on a fresh deploy: schema-tenancy.sql (+ RLS waves), then this file.
-- Idempotent. Safe to re-run. (Drops the earlier pgsodium-based objects if present;
-- safe because there is no live data — encryption was failing before this.)

-- Clean up the prior pgsodium-based attempt, if it exists.
DROP VIEW IF EXISTS public.beehiiv_oauth_connections_decrypted;
DROP FUNCTION IF EXISTS public.upsert_beehiiv_connection(uuid, text, text, text, timestamptz, text, jsonb);
DROP TABLE IF EXISTS beehiiv_oauth_connections;
DROP FUNCTION IF EXISTS public.beehiiv_encrypt(text);
DROP FUNCTION IF EXISTS public.beehiiv_decrypt(bytea);

-- ---- beehiiv_oauth_connections -------------------------------------------------
CREATE TABLE beehiiv_oauth_connections (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider_user_id text NOT NULL,              -- Beehiiv publication id (pub_...)
  access_token     text NOT NULL,              -- AES-256-GCM ciphertext (app layer)
  refresh_token    text,                       -- AES-256-GCM ciphertext (nullable)
  expires_at       timestamptz NOT NULL,
  scope            text NOT NULL,
  profile_json     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, user_id, provider_user_id)
);

CREATE INDEX IF NOT EXISTS idx_beehiiv_oauth_connections_workspace_user
  ON beehiiv_oauth_connections (workspace_id, user_id);

COMMENT ON TABLE  beehiiv_oauth_connections IS 'Per-(workspace,user,publication) Beehiiv MCP OAuth tokens (app-layer AES-256-GCM ciphertext).';
COMMENT ON COLUMN beehiiv_oauth_connections.provider_user_id IS 'Beehiiv publication id (pub_...).';

ALTER TABLE beehiiv_oauth_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS beehiiv_oauth_connections_member_read ON beehiiv_oauth_connections;
CREATE POLICY beehiiv_oauth_connections_member_read ON beehiiv_oauth_connections
  FOR SELECT TO authenticated
  USING (public.user_in_workspace(workspace_id));

-- Tokens are personal credentials: only the owner may write/delete their row.
DROP POLICY IF EXISTS beehiiv_oauth_connections_self_write ON beehiiv_oauth_connections;
CREATE POLICY beehiiv_oauth_connections_self_write ON beehiiv_oauth_connections
  FOR ALL TO authenticated
  USING (user_id = auth.uid() AND public.user_in_workspace(workspace_id))
  WITH CHECK (user_id = auth.uid() AND public.user_in_workspace(workspace_id));

-- ---- mcp_oauth_clients (DCR client registry) -----------------------------------
-- Persists the Dynamic Client Registration result per (issuer, redirect_origin)
-- so authorize + refresh reuse the same client. Public PKCE clients have no
-- secret. Service-role only (no RLS grants to authenticated) — accessed via
-- supabaseAdmin() in lib/integrations/beehiiv/oauth.ts.
CREATE TABLE IF NOT EXISTS mcp_oauth_clients (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issuer            text NOT NULL,
  redirect_origin   text NOT NULL,
  client_id         text NOT NULL,
  client_secret     text,
  registration_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (issuer, redirect_origin)
);

COMMENT ON TABLE mcp_oauth_clients IS 'Dynamic Client Registration results per (issuer, redirect_origin) for MCP OAuth. Service-role only.';

ALTER TABLE mcp_oauth_clients ENABLE ROW LEVEL SECURITY;
-- No policies for `authenticated` → only the service role (supabaseAdmin) can read/write.
