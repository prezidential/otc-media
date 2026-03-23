-- Run this in the Supabase SQL editor to create/update issue_drafts so drafts are saved.
-- Safe to run multiple times (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).

-- Create table if it doesn't exist (e.g. first-time setup)
CREATE TABLE IF NOT EXISTS issue_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  brand_profile_id uuid NOT NULL,
  content text,
  created_at timestamptz DEFAULT now()
);

-- Add columns if you created the table manually without them
ALTER TABLE issue_drafts ADD COLUMN IF NOT EXISTS brand_profile_id uuid;
ALTER TABLE issue_drafts ADD COLUMN IF NOT EXISTS content_json jsonb;
ALTER TABLE issue_drafts ADD COLUMN IF NOT EXISTS content_outline_id uuid;

-- Optional: index for "latest draft per workspace" queries
CREATE INDEX IF NOT EXISTS idx_issue_drafts_workspace_created
  ON issue_drafts (workspace_id, created_at DESC);
