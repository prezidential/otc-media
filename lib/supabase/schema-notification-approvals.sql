-- Notification approvals: provider-agnostic rows for ACE / future channels (Telegram first).
-- Run in Supabase SQL editor. Idempotent patterns.
-- See docs/cornerstone-system-spec-v2.md §3.14 and docs/Cornerstone-OS-ACE.md §2.1.

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
