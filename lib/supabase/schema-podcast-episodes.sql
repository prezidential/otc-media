-- Podcast episodes: persisted podcast script (JSON) + optional audio metadata for an issue draft.
-- Run in Supabase SQL editor after `issue_drafts` exists (see schema-issue_drafts.sql).
-- Safe to run multiple times: CREATE IF NOT EXISTS + index IF NOT EXISTS.
-- App uses service role like other workspace tables; add RLS if you expose this table to the browser.
-- MP3 upload path: set env PODCAST_AUDIO_STORAGE_BUCKET to your bucket name; objects at {workspace_id}/{episode_id}.mp3.

CREATE TABLE IF NOT EXISTS podcast_episodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,

  -- Newsletter draft this episode was generated from (SET NULL if draft is deleted)
  issue_draft_id uuid REFERENCES issue_drafts (id) ON DELETE SET NULL,

  -- Optional lineage (matches issue_drafts.brand_profile_id when present)
  brand_profile_id uuid,

  -- App shape: working_title, script_segments[], outro_cta, sources_acknowledged, estimated_runtime_minutes, etc.
  script_json jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Snapshot at generation time, e.g. { "resolvedCount": 3, "unmatchedCount": 1 }
  grounding_json jsonb,

  tts_provider text NOT NULL DEFAULT 'elevenlabs',
  elevenlabs_voice_id text,
  elevenlabs_model_id text,

  -- Supabase Storage: set bucket + path when you upload the MP3 (signed/public URLs from app)
  audio_storage_bucket text,
  audio_storage_path text,

  -- Or external URL if audio lives outside Storage
  audio_public_url text,

  audio_content_type text NOT NULL DEFAULT 'audio/mpeg',
  audio_byte_length integer,

  -- script_saved = script persisted; audio_ready = audio artifact recorded; failed = last TTS error in tts_error
  status text NOT NULL DEFAULT 'script_saved'
    CHECK (status IN ('script_saved', 'audio_ready', 'failed')),

  tts_error text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_podcast_episodes_workspace_created
  ON podcast_episodes (workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_podcast_episodes_issue_draft
  ON podcast_episodes (issue_draft_id)
  WHERE issue_draft_id IS NOT NULL;

COMMENT ON TABLE podcast_episodes IS 'Persisted podcast scripts and audio metadata (Phase 2 content products).';
COMMENT ON COLUMN podcast_episodes.script_json IS 'PodcastScript-compatible JSON from the podcast-script generator.';
COMMENT ON COLUMN podcast_episodes.audio_storage_bucket IS 'Supabase Storage bucket when audio is stored in-project.';
COMMENT ON COLUMN podcast_episodes.audio_storage_path IS 'Object key within audio_storage_bucket.';
