-- Phase 2A M1 + M2 — LinkedIn OAuth tables (Cornerstone OS spec v2.9 §3.16 + §3.9).
--
-- Tables:
--   linkedin_connections — one row per (workspace, user, LinkedIn account). Stores
--                          the OAuth tokens used to call LinkedIn on the user's
--                          behalf and a small profile snapshot fetched on connect.
--   linkedin_drafts      — drafts of LinkedIn posts derived from leads, newsletter
--                          drafts, or composed by hand. Mirrors the issue_drafts
--                          shape (workspace-scoped, status lifecycle, JSON body).
--
-- Both tables are workspace-scoped and use the existing
-- `public.user_in_workspace(uuid)` helper from `schema-tenancy.sql` for RLS.
-- DO NOT redefine that helper here.
--
-- M2 — Token encryption at rest:
--   `access_token` and `refresh_token` are stored as `bytea` ciphertext produced
--   by `public.linkedin_encrypt(text)` (pgsodium AEAD-DET). Reads go through the
--   `linkedin_connections_decrypted` view, and writes go through the
--   `public.upsert_linkedin_connection(...)` RPC defined below. Application
--   code should not touch the `access_token` / `refresh_token` columns
--   directly; it works in plaintext at the view + RPC boundary.
--
-- Apply order on a fresh deploy:
--   1. schema-tenancy.sql (+ tenancy-backfill, wave-1 / wave-2 RLS)
--   2. schema-linkedin-crypto.sql      (defines linkedin_encrypt/decrypt + key)
--   3. schema-linkedin.sql             (this file)
--
-- Apply order on an existing M1 deploy (tokens are still plaintext text):
--   1. schema-linkedin-crypto.sql      (creates key + helpers — safe to re-run)
--   2. schema-linkedin.sql             (the DO block below detects text columns
--                                       and migrates them to bytea in place,
--                                       re-encrypting existing values)
--
-- Idempotent. Safe to re-run.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---- linkedin_connections ------------------------------------------------------
-- New columns are `bytea` from the start. The DO block further down handles
-- the in-place text->bytea migration for pre-M2 deploys.
CREATE TABLE IF NOT EXISTS linkedin_connections (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider_user_id text NOT NULL,
  access_token     bytea NOT NULL,
  refresh_token    bytea,
  expires_at       timestamptz NOT NULL,
  scope            text NOT NULL,
  profile_json     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, user_id, provider_user_id)
);

CREATE INDEX IF NOT EXISTS idx_linkedin_connections_workspace_user
  ON linkedin_connections (workspace_id, user_id);

-- M1 -> M2 in-place migration. Detects whether `access_token` is still `text`
-- (pre-M2 deploys) and, if so, re-types both token columns to `bytea` by
-- piping the existing plaintext through `linkedin_encrypt`. No-op on fresh
-- deploys (CREATE TABLE above already used bytea) and no-op on re-runs.
DO $migrate$
DECLARE
  v_access_type text;
BEGIN
  SELECT data_type INTO v_access_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name   = 'linkedin_connections'
    AND column_name  = 'access_token';

  IF v_access_type = 'text' THEN
    ALTER TABLE public.linkedin_connections
      ALTER COLUMN access_token  TYPE bytea
        USING public.linkedin_encrypt(access_token),
      ALTER COLUMN refresh_token TYPE bytea
        USING public.linkedin_encrypt(refresh_token);
  END IF;
END
$migrate$;

COMMENT ON TABLE  linkedin_connections IS 'Per-(workspace, user, LinkedIn account) OAuth tokens (M2: pgsodium-encrypted at rest) and profile snapshot.';
COMMENT ON COLUMN linkedin_connections.provider_user_id IS 'LinkedIn `sub` from /v2/userinfo (stable per LinkedIn account).';
COMMENT ON COLUMN linkedin_connections.access_token IS 'M2: AEAD-DET ciphertext (pgsodium, key `linkedin_tokens_v1`). Read via `linkedin_connections_decrypted` view; write via `upsert_linkedin_connection` RPC.';
COMMENT ON COLUMN linkedin_connections.refresh_token IS 'M2: AEAD-DET ciphertext (pgsodium). NULL when the connection was issued without `offline_access` scope.';
COMMENT ON COLUMN linkedin_connections.profile_json IS 'Snapshot from /v2/userinfo at connect time (name, headline, picture, email).';

ALTER TABLE linkedin_connections ENABLE ROW LEVEL SECURITY;

-- All workspace members can see which connections exist in their workspace (so
-- the UI can render "LinkedIn connected as @alice" for the whole team).
DROP POLICY IF EXISTS linkedin_connections_member_read ON linkedin_connections;
CREATE POLICY linkedin_connections_member_read ON linkedin_connections
  FOR SELECT TO authenticated
  USING (public.user_in_workspace(workspace_id));

-- Connections are per-user, not per-workspace-shared: only the row's owner can
-- write to it. This is intentionally stricter than the generic `_member_write`
-- pattern other wave-2 tables use, because access tokens are personal credentials
-- that other workspace members must not be able to overwrite or delete.
--
-- NOTE: this is FOR ALL, so USING is also OR'd into SELECT evaluation. That's
-- harmless here — every row matched by `user_id = auth.uid()` is already a
-- subset of the `_member_read` policy above.
DROP POLICY IF EXISTS linkedin_connections_self_write ON linkedin_connections;
CREATE POLICY linkedin_connections_self_write ON linkedin_connections
  FOR ALL TO authenticated
  USING (user_id = auth.uid() AND public.user_in_workspace(workspace_id))
  WITH CHECK (user_id = auth.uid() AND public.user_in_workspace(workspace_id));

-- ---- linkedin_drafts -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS linkedin_drafts (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id          uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  brand_profile_id      uuid REFERENCES brand_profiles(id) ON DELETE SET NULL,
  source_lead_id        uuid REFERENCES editorial_leads(id) ON DELETE SET NULL,
  source_issue_draft_id uuid REFERENCES issue_drafts(id) ON DELETE SET NULL,
  content_json          jsonb NOT NULL,
  status                text NOT NULL DEFAULT 'draft'
                          CHECK (status IN ('draft', 'reviewed', 'published', 'dismissed')),
  posted_at             timestamptz,
  posted_provider_id    text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_linkedin_drafts_workspace_status_created
  ON linkedin_drafts (workspace_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_linkedin_drafts_workspace_source_issue
  ON linkedin_drafts (workspace_id, source_issue_draft_id)
  WHERE source_issue_draft_id IS NOT NULL;

COMMENT ON TABLE  linkedin_drafts IS 'LinkedIn post drafts derived from leads, newsletter drafts, or composed directly.';
COMMENT ON COLUMN linkedin_drafts.content_json IS 'LinkedInDraftObject shape (see lib/linkedin/types.ts).';
COMMENT ON COLUMN linkedin_drafts.posted_provider_id IS 'LinkedIn UGC post URN once published (e.g. urn:li:share:...).';

ALTER TABLE linkedin_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS linkedin_drafts_member_read ON linkedin_drafts;
CREATE POLICY linkedin_drafts_member_read ON linkedin_drafts
  FOR SELECT TO authenticated
  USING (public.user_in_workspace(workspace_id));

-- Drafts are shared editorial artifacts, like issue_drafts: any workspace member
-- can create, edit, dismiss, or publish them.
DROP POLICY IF EXISTS linkedin_drafts_member_write ON linkedin_drafts;
CREATE POLICY linkedin_drafts_member_write ON linkedin_drafts
  FOR ALL TO authenticated
  USING (public.user_in_workspace(workspace_id))
  WITH CHECK (public.user_in_workspace(workspace_id));

-- ---- decrypted read view -------------------------------------------------------
-- Application code reads from `linkedin_connections_decrypted` so it never
-- handles the ciphertext bytea directly. The view is `security_invoker=true`,
-- so the caller's RLS on the underlying `linkedin_connections` table still
-- applies — only `linkedin_decrypt` itself runs as definer (so it can reach
-- the pgsodium key without granting the caller pgsodium privileges).
CREATE OR REPLACE VIEW public.linkedin_connections_decrypted
  WITH (security_invoker = true)
AS
SELECT
  id,
  workspace_id,
  user_id,
  provider_user_id,
  public.linkedin_decrypt(access_token)  AS access_token,
  public.linkedin_decrypt(refresh_token) AS refresh_token,
  expires_at,
  scope,
  profile_json,
  created_at,
  updated_at
FROM public.linkedin_connections;

COMMENT ON VIEW public.linkedin_connections_decrypted IS
  'Decrypted read view over linkedin_connections. RLS on the base table still applies (security_invoker=true). Use this view for reads; use upsert_linkedin_connection for writes.';

GRANT SELECT ON public.linkedin_connections_decrypted TO authenticated;

-- ---- write RPC -----------------------------------------------------------------
-- Single atomic write path so callers never see the encryption boundary. The
-- function is SECURITY INVOKER, so the RLS check
-- `user_id = auth.uid() AND public.user_in_workspace(workspace_id)` from the
-- `linkedin_connections_self_write` policy still applies. The function pins
-- `user_id := auth.uid()` itself so a caller cannot impersonate another user.
CREATE OR REPLACE FUNCTION public.upsert_linkedin_connection(
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
    RAISE EXCEPTION 'upsert_linkedin_connection requires an authenticated session';
  END IF;

  INSERT INTO public.linkedin_connections (
    workspace_id,
    user_id,
    provider_user_id,
    access_token,
    refresh_token,
    expires_at,
    scope,
    profile_json,
    updated_at
  ) VALUES (
    p_workspace_id,
    auth.uid(),
    p_provider_user_id,
    public.linkedin_encrypt(p_access_token),
    public.linkedin_encrypt(p_refresh_token),
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

COMMENT ON FUNCTION public.upsert_linkedin_connection(uuid, text, text, text, timestamptz, text, jsonb) IS
  'Atomic upsert into linkedin_connections that encrypts the tokens via linkedin_encrypt. Pins user_id := auth.uid(); RLS on linkedin_connections still applies.';

REVOKE ALL ON FUNCTION public.upsert_linkedin_connection(uuid, text, text, text, timestamptz, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_linkedin_connection(uuid, text, text, text, timestamptz, text, jsonb) TO authenticated;
