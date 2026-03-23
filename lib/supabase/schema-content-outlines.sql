-- Content outlines: workspace-scoped templates for issue structure (separate from brand_profiles voice).
-- Run in Supabase SQL editor. Safe to run multiple times.

CREATE TABLE IF NOT EXISTS content_outlines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('newsletter_issue', 'insider_access')),
  spec_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_content_outlines_workspace_kind
  ON content_outlines (workspace_id, kind);

-- At most one default outline per workspace per kind
CREATE UNIQUE INDEX IF NOT EXISTS content_outlines_one_default_per_workspace_kind
  ON content_outlines (workspace_id, kind)
  WHERE is_default = true;

-- Data: use the Issues page → "Seed default outlines" (POST /api/content-outlines/seed). No SQL seed files for row data.
