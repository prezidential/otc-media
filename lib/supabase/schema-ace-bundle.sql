-- ACE Phase 1 — single paste for Supabase SQL editor.
-- Order: notification_approvals → content_lanes (+ FK columns) → ace_runs.
-- Idempotent. See docs/Cornerstone-OS-ACE.md §2.

-- === schema-notification-approvals.sql ===
CREATE TABLE IF NOT EXISTS notification_approvals (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      UUID NOT NULL,
  provider          TEXT NOT NULL DEFAULT 'telegram',
  entity_type       TEXT NOT NULL CHECK (entity_type IN ('newsletter_draft', 'linkedin_draft', 'lead_batch')),
  entity_id         UUID NOT NULL,
  provider_message_ref TEXT,
  status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
  preview_text      TEXT NOT NULL,
  sent_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at      TIMESTAMPTZ,
  expires_at        TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '8 hours',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notification_approvals_status
  ON notification_approvals(status);

CREATE INDEX IF NOT EXISTS idx_notification_approvals_entity
  ON notification_approvals(entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_notification_approvals_workspace
  ON notification_approvals(workspace_id, status);

-- === schema-content-lanes.sql ===
CREATE TABLE IF NOT EXISTS content_lanes (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id              UUID NOT NULL,
  name                      TEXT NOT NULL,
  slug                      TEXT NOT NULL,
  description               TEXT,
  audience                  TEXT,
  voice_guidance            TEXT,
  topics                    TEXT[] DEFAULT '{}',
  ring                      TEXT NOT NULL CHECK (ring IN ('inner', 'middle', 'outer')),
  target_frequency_per_month INTEGER DEFAULT 4,
  is_active                 BOOLEAN DEFAULT TRUE,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(workspace_id, slug)
);

ALTER TABLE issue_drafts
  ADD COLUMN IF NOT EXISTS content_lane_id UUID REFERENCES content_lanes(id);

ALTER TABLE editorial_leads
  ADD COLUMN IF NOT EXISTS content_lane_id UUID REFERENCES content_lanes(id);

-- === schema-ace-runs.sql ===
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
