-- Research Intent profile (one per workspace)
-- workspace_id is text to match the legacy pattern in signals, brand_profiles, etc.
-- RLS casts to uuid to match the user_in_workspace() helper signature.
CREATE TABLE IF NOT EXISTS research_intent (
  id            uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id  text        NOT NULL UNIQUE,
  topic_focus   text[]      NOT NULL DEFAULT '{}',
  watch_entities text[]     NOT NULL DEFAULT '{}',
  keywords      text[]      NOT NULL DEFAULT '{}',
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE research_intent ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace members can read research_intent"
  ON research_intent FOR SELECT
  USING (public.user_in_workspace(workspace_id::uuid));

CREATE POLICY "workspace members can upsert research_intent"
  ON research_intent FOR ALL
  USING (public.user_in_workspace(workspace_id::uuid))
  WITH CHECK (public.user_in_workspace(workspace_id::uuid));

-- Research sources — approved feeds the Researcher Agent ingests from.
-- Sources can be added by the user (auto-approved) or proposed by the agent
-- (status=proposed until the user approves).
CREATE TABLE IF NOT EXISTS research_sources (
  id                uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id      text        NOT NULL,
  name              text        NOT NULL,
  feed_url          text        NOT NULL,
  site_url          text,
  status            text        NOT NULL DEFAULT 'proposed'
                                CHECK (status IN ('proposed', 'approved', 'rejected')),
  proposed_by       text        NOT NULL DEFAULT 'user'
                                CHECK (proposed_by IN ('agent', 'user')),
  trust_score       float       NOT NULL DEFAULT 0.7,
  last_ingested_at  timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, feed_url)
);

ALTER TABLE research_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace members can read research_sources"
  ON research_sources FOR SELECT
  USING (public.user_in_workspace(workspace_id::uuid));

CREATE POLICY "workspace members can manage research_sources"
  ON research_sources FOR ALL
  USING (public.user_in_workspace(workspace_id::uuid))
  WITH CHECK (public.user_in_workspace(workspace_id::uuid));
