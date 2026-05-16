-- Phase 2A — M2 (workspace_settings extensions for cron iteration).
--
-- This file is purely additive. The base `workspace_settings` table is created
-- in `lib/supabase/schema-brand-profile-extensions.sql` (workspace_id PK,
-- default_brand_profile_id, updated_at). RLS for it is enabled in
-- `schema-rls-wave1.sql` (workspace_settings_workspace_rw).
--
-- M2 (`WORKSPACE_ID` env removal) needs the cron entrypoint
-- (`app/api/ace/cron/route.ts`) to know which workspaces to run ACE for once
-- the legacy single-tenant `process.env.WORKSPACE_ID` is gone. We model that as
-- a per-workspace opt-in flag rather than a dedicated `ace_workspaces` table:
-- one row per workspace already exists for the brand-profile-default pointer,
-- and ACE-enable is workspace-scoped configuration of the same shape.
--
-- Idempotent. Run after `schema-brand-profile-extensions.sql` (or any time
-- after — the ALTER guards on column existence).

ALTER TABLE workspace_settings
  ADD COLUMN IF NOT EXISTS ace_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN workspace_settings.ace_enabled IS
  'When true, the ACE cron entrypoint (POST /api/ace/cron) runs the ACE pipeline for this workspace on every cron tick. Replaces the single-tenant `process.env.ACE_ENABLED` + `process.env.WORKSPACE_ID` pair.';

-- Backward-compat: the legacy single-tenant deployment ran ACE for the
-- workspace whose UUID was set as `process.env.WORKSPACE_ID`. To keep that
-- workspace running ACE after the env var is removed, opt it in here. Only
-- runs when the env var is still defined in the SQL editor session
-- (`SET app.legacy_workspace_id = '<uuid>'` before pasting this file), so the
-- block is a no-op on fresh deploys that never had a legacy workspace.
--
-- Safe to re-run: the upsert keys on workspace_id and only flips ace_enabled
-- to true; it does not clobber default_brand_profile_id.
DO $$
DECLARE
  legacy_ws text;
BEGIN
  -- current_setting(..., true) returns NULL when the GUC is unset, instead of
  -- raising. NULLIF treats the empty string the same way.
  legacy_ws := NULLIF(current_setting('app.legacy_workspace_id', true), '');

  IF legacy_ws IS NULL THEN
    RAISE NOTICE
      'app.legacy_workspace_id not set; skipping ace_enabled backfill. To opt in your legacy workspace, run: SET app.legacy_workspace_id = ''<uuid>''; then re-run this file.';
    RETURN;
  END IF;

  INSERT INTO workspace_settings (workspace_id, ace_enabled)
  VALUES (legacy_ws, true)
  ON CONFLICT (workspace_id) DO UPDATE
    SET ace_enabled = true;

  RAISE NOTICE 'ace_enabled set to true for legacy workspace %.', legacy_ws;
END $$;
