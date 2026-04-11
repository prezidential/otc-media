-- Phase 2A: ElevenLabs defaults per brand + workspace default profile pointer.
-- Run in Supabase SQL editor after brand_profiles exists.

ALTER TABLE brand_profiles ADD COLUMN IF NOT EXISTS elevenlabs_voice_id text;
ALTER TABLE brand_profiles ADD COLUMN IF NOT EXISTS elevenlabs_model_id text;

COMMENT ON COLUMN brand_profiles.elevenlabs_voice_id IS 'Optional default ElevenLabs voice id for podcast TTS when env/body omit voiceId.';
COMMENT ON COLUMN brand_profiles.elevenlabs_model_id IS 'Optional default ElevenLabs model id (e.g. eleven_turbo_v2_5).';

CREATE TABLE IF NOT EXISTS workspace_settings (
  workspace_id text NOT NULL PRIMARY KEY,
  default_brand_profile_id uuid REFERENCES brand_profiles (id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workspace_settings_default_brand
  ON workspace_settings (default_brand_profile_id)
  WHERE default_brand_profile_id IS NOT NULL;

COMMENT ON TABLE workspace_settings IS 'Per-workspace UI defaults; WORKSPACE_ID env matches workspace_id text.';
