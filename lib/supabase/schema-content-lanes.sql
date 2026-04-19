-- Content lanes: workspace editorial lanes (inner / middle / outer ring) for ACE balance + tagging.
-- Run after issue_drafts and editorial_leads exist. Idempotent.
-- See docs/cornerstone-system-spec-v2.md §3.14 and docs/Cornerstone-OS-ACE.md §2.2.

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
