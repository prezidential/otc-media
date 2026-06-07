-- Beehiiv MCP OAuth — connection tokens + DCR client registry.
--
-- Mirrors schema-linkedin.sql (per-(workspace,user,account) OAuth tokens,
-- pgsodium-encrypted at rest, RLS via public.user_in_workspace, decrypted view,
-- upsert RPC). Apply order on a fresh deploy:
--   1. schema-tenancy.sql (+ RLS waves)
--   2. schema-beehiiv-crypto.sql   (beehiiv_encrypt/decrypt + key)
--   3. schema-beehiiv-oauth.sql    (this file)
--
-- Idempotent. Safe to re-run.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---- beehiiv_oauth_connections -------------------------------------------------
CREATE TABLE IF NOT EXISTS beehiiv_oauth_connections (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider_user_id text NOT NULL,              -- Beehiiv publication id (pub_...)
  access_token     bytea NOT NULL,             -- pgsodium AEAD-DET ciphertext
  refresh_token    bytea,                      -- pgsodium AEAD-DET ciphertext (nullable)
  expires_at       timestamptz NOT NULL,
  scope            text NOT NULL,
  profile_json     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, user_id, provider_user_id)
);

CREATE INDEX IF NOT EXISTS idx_beehiiv_oauth_connections_workspace_user
  ON beehiiv_oauth_connections (workspace_id, user_id);

COMMENT ON TABLE  beehiiv_oauth_connections IS 'Per-(workspace,user,publication) Beehiiv MCP OAuth tokens (pgsodium-encrypted at rest).';
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

-- ---- decrypted read view -------------------------------------------------------
CREATE OR REPLACE VIEW public.beehiiv_oauth_connections_decrypted
  WITH (security_invoker = true)
AS
SELECT
  id,
  workspace_id,
  user_id,
  provider_user_id,
  public.beehiiv_decrypt(access_token)  AS access_token,
  public.beehiiv_decrypt(refresh_token) AS refresh_token,
  expires_at,
  scope,
  profile_json,
  created_at,
  updated_at
FROM public.beehiiv_oauth_connections;

COMMENT ON VIEW public.beehiiv_oauth_connections_decrypted IS
  'Decrypted read view over beehiiv_oauth_connections (security_invoker=true; base-table RLS applies). Reads here; writes via upsert_beehiiv_connection.';

GRANT SELECT ON public.beehiiv_oauth_connections_decrypted TO authenticated;

-- ---- write RPC -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.upsert_beehiiv_connection(
  p_workspace_id     uuid,
  p_provider_user_id text,
  p_access_token     text,
  p_refresh_token    text,
  p_expires_at       timestamptz,
  p_scope            text,
  p_profile_json     jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'upsert_beehiiv_connection requires an authenticated session';
  END IF;

  INSERT INTO public.beehiiv_oauth_connections (
    workspace_id, user_id, provider_user_id, access_token, refresh_token,
    expires_at, scope, profile_json, updated_at
  ) VALUES (
    p_workspace_id,
    auth.uid(),
    p_provider_user_id,
    public.beehiiv_encrypt(p_access_token),
    public.beehiiv_encrypt(p_refresh_token),
    p_expires_at,
    p_scope,
    coalesce(p_profile_json, '{}'::jsonb),
    now()
  )
  ON CONFLICT (workspace_id, user_id, provider_user_id) DO UPDATE
    SET access_token  = EXCLUDED.access_token,
        refresh_token = EXCLUDED.refresh_token,
        expires_at    = EXCLUDED.expires_at,
        scope         = EXCLUDED.scope,
        profile_json  = EXCLUDED.profile_json,
        updated_at    = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.upsert_beehiiv_connection(uuid, text, text, text, timestamptz, text, jsonb) IS
  'Atomic upsert into beehiiv_oauth_connections; encrypts tokens via beehiiv_encrypt. Pins user_id := auth.uid(); RLS still applies.';

REVOKE ALL ON FUNCTION public.upsert_beehiiv_connection(uuid, text, text, text, timestamptz, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_beehiiv_connection(uuid, text, text, text, timestamptz, text, jsonb) TO authenticated;

-- ---- mcp_oauth_clients (DCR client registry) -----------------------------------
-- Persists the Dynamic Client Registration result per (issuer, redirect_origin)
-- so authorize + refresh reuse the same client. Public PKCE clients have no
-- secret; the nullable client_secret is kept for servers that force a
-- confidential client. Service-role only (no RLS grants to authenticated) —
-- accessed via supabaseAdmin() in lib/integrations/beehiiv/oauth.ts.
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
