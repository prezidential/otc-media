-- Phase 2A — RLS rollout, wave 1 (Cornerstone OS spec v2.9 §3.16).
--
-- Enables Row-Level Security on the tables read by the wave-1 routes:
--   GET /api/dashboard/stats, /api/search,
--   /api/signals/list, /api/issues/list, /api/brand-profiles/list.
--
-- Tables in this wave:
--   signals, editorial_leads, issue_drafts, content_outlines,
--   brand_profiles, workspace_settings, runs.
--
-- All `workspace_id` columns are cast to `uuid` because the legacy single-tenant
-- schema stores them as `text` (they originally came from
-- `process.env.WORKSPACE_ID`). The helper `public.user_in_workspace(uuid)` only
-- has a uuid signature, so we explicitly cast in each policy. This is safe — the
-- existing values already conform to the uuid format.
--
-- Service-role connections still bypass RLS (used by cron, webhooks,
-- the orchestrator). Per-user routes go through supabaseUser() and are
-- now restricted to their active workspace.
--
-- Idempotent. Run after schema-tenancy.sql and the backfill block.
-- Wave 2 (notification_approvals, content_lanes, ace_runs, brainstorm_*,
-- podcast_episodes, sources) ships in a follow-up SQL file.

-- ---- signals -------------------------------------------------------------------
ALTER TABLE signals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS signals_workspace_rw ON signals;
CREATE POLICY signals_workspace_rw ON signals
  FOR ALL TO authenticated
  USING (public.user_in_workspace(workspace_id::uuid))
  WITH CHECK (public.user_in_workspace(workspace_id::uuid));

-- ---- editorial_leads -----------------------------------------------------------
ALTER TABLE editorial_leads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS editorial_leads_workspace_rw ON editorial_leads;
CREATE POLICY editorial_leads_workspace_rw ON editorial_leads
  FOR ALL TO authenticated
  USING (public.user_in_workspace(workspace_id::uuid))
  WITH CHECK (public.user_in_workspace(workspace_id::uuid));

-- ---- issue_drafts --------------------------------------------------------------
ALTER TABLE issue_drafts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS issue_drafts_workspace_rw ON issue_drafts;
CREATE POLICY issue_drafts_workspace_rw ON issue_drafts
  FOR ALL TO authenticated
  USING (public.user_in_workspace(workspace_id::uuid))
  WITH CHECK (public.user_in_workspace(workspace_id::uuid));

-- ---- content_outlines ----------------------------------------------------------
ALTER TABLE content_outlines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS content_outlines_workspace_rw ON content_outlines;
CREATE POLICY content_outlines_workspace_rw ON content_outlines
  FOR ALL TO authenticated
  USING (public.user_in_workspace(workspace_id::uuid))
  WITH CHECK (public.user_in_workspace(workspace_id::uuid));

-- ---- brand_profiles ------------------------------------------------------------
ALTER TABLE brand_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS brand_profiles_workspace_rw ON brand_profiles;
CREATE POLICY brand_profiles_workspace_rw ON brand_profiles
  FOR ALL TO authenticated
  USING (public.user_in_workspace(workspace_id::uuid))
  WITH CHECK (public.user_in_workspace(workspace_id::uuid));

-- ---- workspace_settings --------------------------------------------------------
ALTER TABLE workspace_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS workspace_settings_workspace_rw ON workspace_settings;
CREATE POLICY workspace_settings_workspace_rw ON workspace_settings
  FOR ALL TO authenticated
  USING (public.user_in_workspace(workspace_id::uuid))
  WITH CHECK (public.user_in_workspace(workspace_id::uuid));

-- ---- runs (used by dashboard last-ingest panel) --------------------------------
ALTER TABLE runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS runs_workspace_rw ON runs;
CREATE POLICY runs_workspace_rw ON runs
  FOR ALL TO authenticated
  USING (public.user_in_workspace(workspace_id::uuid))
  WITH CHECK (public.user_in_workspace(workspace_id::uuid));
