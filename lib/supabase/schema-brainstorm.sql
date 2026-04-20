-- Brainstorming Hub: sessions + messages (see cornerstone-system-spec-v2 Brainstorming Hub).
-- Run in Supabase SQL editor. Safe to run multiple times.

CREATE TABLE IF NOT EXISTS brainstorm_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  title text NOT NULL DEFAULT 'Brainstorm',
  brand_profile_id uuid,
  artifact_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS brainstorm_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  session_id uuid NOT NULL REFERENCES brainstorm_sessions (id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content text NOT NULL DEFAULT '',
  tool_calls jsonb,
  tool_results jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_brainstorm_sessions_workspace_updated
  ON brainstorm_sessions (workspace_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_brainstorm_messages_session_created
  ON brainstorm_messages (session_id, created_at ASC);

-- Existing projects: add artifact column if the table predates this field.
ALTER TABLE brainstorm_sessions
  ADD COLUMN IF NOT EXISTS artifact_json jsonb NOT NULL DEFAULT '{}'::jsonb;
