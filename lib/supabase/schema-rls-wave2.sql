-- Phase 2A — RLS rollout, wave 2 (Cornerstone OS spec v2.9 §3.16).
--
-- Enables Row-Level Security on the tables touched by the wave-2 routes:
--   brainstorm/* (sessions + messages), content-lanes/seed, ace/dashboard,
--   publish/beehiiv (notification_approvals + ace_runs writes),
--   content-products/podcast-tts (podcast_episodes).
--
-- Tables in this wave:
--   brainstorm_sessions, brainstorm_messages, content_lanes,
--   notification_approvals, ace_runs, podcast_episodes.
--
-- Policy shape (different from wave-1 `FOR ALL TO authenticated`):
--   * <table>_member_read  — any workspace member can SELECT
--   * <table>_owner_write  — only workspace owners can INSERT/UPDATE/DELETE
--
-- Owner-write reflects that these tables back agentic / orchestrator state
-- (ACE runs, lane balance, podcast publication, approval queue) that
-- editors and viewers can observe but should not mutate. Brainstorm sessions
-- and content lanes are configuration-shaped so we treat them the same way.
-- If editor-write turns out to be needed for any of these in M1.x feedback,
-- swap the helper from `user_is_workspace_owner` to a future
-- `user_can_edit_workspace` helper.
--
-- Helpers are defined once in `schema-tenancy.sql`:
--   public.user_in_workspace(uuid)        — STABLE plpgsql SECURITY DEFINER
--   public.user_is_workspace_owner(uuid)  — STABLE plpgsql SECURITY DEFINER
-- DO NOT redefine them here. Re-creating them with different bodies in any
-- file breaks the recursion guard documented in §3.16.
--
-- All wave-2 tables already use `workspace_id uuid`, so no `::uuid` cast
-- (wave-1 needed it because the legacy tables stored workspace_id as text).
--
-- Service-role connections still bypass RLS (cron, webhooks, the ACE
-- orchestrator, the podcast-tts storage upload path).
--
-- Idempotent. Run after schema-tenancy.sql + schema-rls-wave1.sql.

-- ---- brainstorm_sessions -------------------------------------------------------
ALTER TABLE brainstorm_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS brainstorm_sessions_member_read ON brainstorm_sessions;
CREATE POLICY brainstorm_sessions_member_read ON brainstorm_sessions
  FOR SELECT TO authenticated
  USING (public.user_in_workspace(workspace_id));

DROP POLICY IF EXISTS brainstorm_sessions_owner_write ON brainstorm_sessions;
CREATE POLICY brainstorm_sessions_owner_write ON brainstorm_sessions
  FOR ALL TO authenticated
  USING (public.user_is_workspace_owner(workspace_id))
  WITH CHECK (public.user_is_workspace_owner(workspace_id));

-- ---- brainstorm_messages -------------------------------------------------------
ALTER TABLE brainstorm_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS brainstorm_messages_member_read ON brainstorm_messages;
CREATE POLICY brainstorm_messages_member_read ON brainstorm_messages
  FOR SELECT TO authenticated
  USING (public.user_in_workspace(workspace_id));

DROP POLICY IF EXISTS brainstorm_messages_owner_write ON brainstorm_messages;
CREATE POLICY brainstorm_messages_owner_write ON brainstorm_messages
  FOR ALL TO authenticated
  USING (public.user_is_workspace_owner(workspace_id))
  WITH CHECK (public.user_is_workspace_owner(workspace_id));

-- ---- content_lanes -------------------------------------------------------------
ALTER TABLE content_lanes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS content_lanes_member_read ON content_lanes;
CREATE POLICY content_lanes_member_read ON content_lanes
  FOR SELECT TO authenticated
  USING (public.user_in_workspace(workspace_id));

DROP POLICY IF EXISTS content_lanes_owner_write ON content_lanes;
CREATE POLICY content_lanes_owner_write ON content_lanes
  FOR ALL TO authenticated
  USING (public.user_is_workspace_owner(workspace_id))
  WITH CHECK (public.user_is_workspace_owner(workspace_id));

-- ---- notification_approvals ----------------------------------------------------
ALTER TABLE notification_approvals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notification_approvals_member_read ON notification_approvals;
CREATE POLICY notification_approvals_member_read ON notification_approvals
  FOR SELECT TO authenticated
  USING (public.user_in_workspace(workspace_id));

DROP POLICY IF EXISTS notification_approvals_owner_write ON notification_approvals;
CREATE POLICY notification_approvals_owner_write ON notification_approvals
  FOR ALL TO authenticated
  USING (public.user_is_workspace_owner(workspace_id))
  WITH CHECK (public.user_is_workspace_owner(workspace_id));

-- ---- ace_runs ------------------------------------------------------------------
ALTER TABLE ace_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ace_runs_member_read ON ace_runs;
CREATE POLICY ace_runs_member_read ON ace_runs
  FOR SELECT TO authenticated
  USING (public.user_in_workspace(workspace_id));

DROP POLICY IF EXISTS ace_runs_owner_write ON ace_runs;
CREATE POLICY ace_runs_owner_write ON ace_runs
  FOR ALL TO authenticated
  USING (public.user_is_workspace_owner(workspace_id))
  WITH CHECK (public.user_is_workspace_owner(workspace_id));

-- ---- podcast_episodes ----------------------------------------------------------
ALTER TABLE podcast_episodes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS podcast_episodes_member_read ON podcast_episodes;
CREATE POLICY podcast_episodes_member_read ON podcast_episodes
  FOR SELECT TO authenticated
  USING (public.user_in_workspace(workspace_id));

DROP POLICY IF EXISTS podcast_episodes_owner_write ON podcast_episodes;
CREATE POLICY podcast_episodes_owner_write ON podcast_episodes
  FOR ALL TO authenticated
  USING (public.user_is_workspace_owner(workspace_id))
  WITH CHECK (public.user_is_workspace_owner(workspace_id));
