-- ACE runs: one row per autonomous loop execution (cron, manual, or API).
-- Run after issue_drafts and notification_approvals exist. Idempotent.
-- See docs/cornerstone-system-spec-v2.md §3.14 and docs/Cornerstone-OS-ACE.md §2.3.

CREATE TABLE IF NOT EXISTS ace_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL,
  run_trigger       TEXT NOT NULL CHECK (run_trigger IN ('cron', 'manual', 'api')),
  status          TEXT NOT NULL DEFAULT 'running'
                    CHECK (status IN ('running', 'completed', 'failed', 'awaiting_approval', 'skipped')),
  pipeline_run_id UUID,
  draft_id        UUID REFERENCES issue_drafts(id),
  approval_id     UUID REFERENCES notification_approvals(id),
  summary         TEXT,
  error           TEXT,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ace_runs_workspace_status
  ON ace_runs(workspace_id, status);

CREATE INDEX IF NOT EXISTS idx_ace_runs_started
  ON ace_runs(started_at DESC);
