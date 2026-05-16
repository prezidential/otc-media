-- Phase 2A M1 — LinkedIn OAuth tables (Cornerstone OS spec v2.9 §3.16 + §3.9).
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
-- Token encryption (M1 limitation): `access_token` and `refresh_token` are stored
-- as plaintext in this milestone. The columns are guarded by RLS so only the
-- token's owner (via the `linkedin_connections_self_write` policy) can write
-- them, and a service-role connection is required to read at all once we
-- restrict authenticated SELECTs further. M2 will migrate these columns to
-- pgsodium-encrypted secrets (`pgsodium.create_key()` + `crypto_aead_det_*`),
-- mirroring Supabase's recommended pattern for OAuth tokens.
--
-- Idempotent. Run in the Supabase SQL editor after `schema-tenancy.sql`,
-- `schema-tenancy-backfill.sql`, and the wave-1 / wave-2 RLS files. Safe to
-- re-run.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---- linkedin_connections ------------------------------------------------------
CREATE TABLE IF NOT EXISTS linkedin_connections (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider_user_id text NOT NULL,
  access_token     text NOT NULL,
  refresh_token    text,
  expires_at       timestamptz NOT NULL,
  scope            text NOT NULL,
  profile_json     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, user_id, provider_user_id)
);

CREATE INDEX IF NOT EXISTS idx_linkedin_connections_workspace_user
  ON linkedin_connections (workspace_id, user_id);

COMMENT ON TABLE  linkedin_connections IS 'Per-(workspace, user, LinkedIn account) OAuth tokens and profile snapshot.';
COMMENT ON COLUMN linkedin_connections.provider_user_id IS 'LinkedIn `sub` from /v2/userinfo (stable per LinkedIn account).';
COMMENT ON COLUMN linkedin_connections.access_token IS 'M1: plaintext. M2: migrate to pgsodium-encrypted column. RLS-restricted to the owning user.';
COMMENT ON COLUMN linkedin_connections.refresh_token IS 'M1: plaintext. M2: pgsodium. Optional — LinkedIn only issues refresh tokens with the offline_access scope.';
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
