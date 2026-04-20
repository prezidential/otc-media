-- Phase 2A — multi-tenant authorization scaffolding (Cornerstone OS spec v2.9 §3.16).
--
-- Tables:
--   workspaces           — top-level tenant container.
--   workspace_members    — (workspace_id, user_id, role) join table to auth.users.
--   workspace_invites    — pending invites resolved by token.
--
-- Helper:
--   auth.user_in_workspace(uuid) — STABLE boolean used by every workspace-scoped RLS policy.
--
-- Migration / backfill:
--   The block at the bottom inserts a "default" workspace whose id matches the existing
--   WORKSPACE_ID env value and binds every existing auth.users row to it as 'owner'.
--   Set the GUC `app.workspace_id` before running, e.g.:
--     SET app.workspace_id = '11111111-2222-3333-4444-555555555555';
--   The block is idempotent and safe to re-run.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS workspaces (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                     text UNIQUE NOT NULL,
  name                     text NOT NULL,
  onboarding_completed_at  timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role         text NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_workspace_members_user
  ON workspace_members(user_id);

CREATE TABLE IF NOT EXISTS workspace_invites (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email        text NOT NULL,
  role         text NOT NULL DEFAULT 'editor' CHECK (role IN ('owner', 'editor', 'viewer')),
  token        text UNIQUE NOT NULL,
  invited_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at   timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  accepted_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workspace_invites_workspace
  ON workspace_invites(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_invites_email
  ON workspace_invites(lower(email));

-- Helper used by RLS policies. STABLE so PostgREST can cache the result for the life
-- of the request. Lives in the auth schema so policies can write `auth.user_in_workspace(...)`.
CREATE OR REPLACE FUNCTION auth.user_in_workspace(ws uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.workspace_members m
    WHERE m.workspace_id = ws
      AND m.user_id = auth.uid()
  );
$$;

GRANT EXECUTE ON FUNCTION auth.user_in_workspace(uuid) TO authenticated, anon;

-- ---- RLS on the tenancy tables themselves --------------------------------------
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workspaces_member_read ON workspaces;
CREATE POLICY workspaces_member_read ON workspaces
  FOR SELECT TO authenticated
  USING (auth.user_in_workspace(id));

DROP POLICY IF EXISTS workspaces_owner_write ON workspaces;
CREATE POLICY workspaces_owner_write ON workspaces
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members m
      WHERE m.workspace_id = workspaces.id
        AND m.user_id = auth.uid()
        AND m.role = 'owner'
    )
  );

DROP POLICY IF EXISTS workspace_members_self_read ON workspace_members;
CREATE POLICY workspace_members_self_read ON workspace_members
  FOR SELECT TO authenticated
  USING (auth.user_in_workspace(workspace_id));

DROP POLICY IF EXISTS workspace_members_owner_write ON workspace_members;
CREATE POLICY workspace_members_owner_write ON workspace_members
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members m
      WHERE m.workspace_id = workspace_members.workspace_id
        AND m.user_id = auth.uid()
        AND m.role = 'owner'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workspace_members m
      WHERE m.workspace_id = workspace_members.workspace_id
        AND m.user_id = auth.uid()
        AND m.role = 'owner'
    )
  );

DROP POLICY IF EXISTS workspace_invites_member_read ON workspace_invites;
CREATE POLICY workspace_invites_member_read ON workspace_invites
  FOR SELECT TO authenticated
  USING (auth.user_in_workspace(workspace_id));

DROP POLICY IF EXISTS workspace_invites_owner_write ON workspace_invites;
CREATE POLICY workspace_invites_owner_write ON workspace_invites
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members m
      WHERE m.workspace_id = workspace_invites.workspace_id
        AND m.user_id = auth.uid()
        AND m.role = 'owner'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workspace_members m
      WHERE m.workspace_id = workspace_invites.workspace_id
        AND m.user_id = auth.uid()
        AND m.role = 'owner'
    )
  );

-- ---- One-shot backfill ---------------------------------------------------------
-- Bind the existing single-tenant data to a real workspaces row whose id equals
-- the WORKSPACE_ID env value. Set the GUC before running:
--   SET app.workspace_id = '<the-uuid-from-.env.local>';
-- After running, every auth.users row becomes an 'owner' of that workspace.
DO $$
DECLARE
  ws_id uuid;
BEGIN
  BEGIN
    ws_id := current_setting('app.workspace_id', true)::uuid;
  EXCEPTION WHEN OTHERS THEN
    ws_id := NULL;
  END;

  IF ws_id IS NULL THEN
    RAISE NOTICE 'app.workspace_id not set — skipping default-workspace backfill. Run "SET app.workspace_id = ''<uuid>'';" then re-run this script.';
    RETURN;
  END IF;

  INSERT INTO workspaces (id, slug, name, onboarding_completed_at)
  VALUES (ws_id, 'default', 'Default workspace', now())
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO workspace_members (workspace_id, user_id, role)
  SELECT ws_id, u.id, 'owner'
  FROM auth.users u
  ON CONFLICT (workspace_id, user_id) DO NOTHING;

  RAISE NOTICE 'Backfill complete for workspace %', ws_id;
END $$;
