-- Post performance cache (§3.19 P1c). A workspace-scoped snapshot of recent
-- Beehiiv post stats (open/click rate), refreshed by the sync route from the
-- live integration. Both the dashboard "themes that resonated" surface and the
-- Brainstormer's get_top_performing_themes tool read from here, so ideation can
-- be grounded in what actually converted without a live API call each time.
-- Run in Supabase SQL editor. Safe to run multiple times.

CREATE TABLE IF NOT EXISTS post_performance (
  workspace_id     uuid NOT NULL,
  external_post_id text NOT NULL,        -- Beehiiv post id
  title            text NOT NULL DEFAULT 'Untitled',
  status           text,
  open_rate        double precision,     -- percent
  click_rate       double precision,     -- percent
  published_at     timestamptz,
  fetched_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, external_post_id)
);

CREATE INDEX IF NOT EXISTS idx_post_performance_workspace_click
  ON post_performance (workspace_id, click_rate DESC);

-- Member-read; writes happen via the service-role client (supabaseAdmin) from the
-- sync route, so no user-facing write policy is needed.
ALTER TABLE post_performance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS post_performance_member_read ON post_performance;
CREATE POLICY post_performance_member_read ON post_performance
  FOR SELECT TO authenticated
  USING (public.user_in_workspace(workspace_id));
