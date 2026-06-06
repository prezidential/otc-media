-- Phase 1 — Subscriber Health Pipeline (Agent Execution Plan v1, §3.17).
--
-- Per-workspace opt-in flag + per-metric health history. The weekly cron
-- (GET|POST /api/pipelines/health-report) iterates workspaces with
-- `subscriber_health_enabled = true` and upserts one history row per KPI metric.
-- The in-app Subscriber Health panel reads the latest value/status/streak.
--
-- Idempotent. Run after `schema-brand-profile-extensions.sql` (base
-- `workspace_settings` table) and `schema-tenancy.sql` (the
-- `public.user_in_workspace(uuid)` RLS helper). Audit records reuse the existing
-- `runs` table (run_type = 'pipeline:subscriber-health') — no new audit table.

ALTER TABLE workspace_settings
  ADD COLUMN IF NOT EXISTS subscriber_health_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN workspace_settings.subscriber_health_enabled IS
  'When true, the weekly Subscriber Health cron (GET|POST /api/pipelines/health-report) runs for this workspace.';

CREATE TABLE IF NOT EXISTS subscriber_health_history (
  workspace_id            text NOT NULL,
  metric                  text NOT NULL,
  last_value              double precision,        -- latest computed value (for the UI)
  last_week               integer,                 -- ISO week of the latest run
  consecutive_weeks_below integer NOT NULL DEFAULT 0,
  last_status             text NOT NULL CHECK (last_status IN ('green', 'yellow', 'red')),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, metric)
);

-- Read-only for workspace members; the cron writes via the service-role client
-- (`supabaseAdmin()`), which bypasses RLS. Cast to uuid to match the
-- user_in_workspace() signature (workspace_id is text for workspace_settings parity).
ALTER TABLE subscriber_health_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS subscriber_health_history_read ON subscriber_health_history;
CREATE POLICY subscriber_health_history_read ON subscriber_health_history
  FOR SELECT USING (public.user_in_workspace(workspace_id::uuid));
