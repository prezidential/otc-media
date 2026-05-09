-- Phase 2A — multi-tenant authorization scaffolding (Cornerstone OS spec v2.9 §3.16).
--
-- Tables:
--   workspaces           — top-level tenant container.
--   workspace_members    — (workspace_id, user_id, role) join table to auth.users.
--   workspace_invites    — pending invites resolved by token.
--
-- Helper:
--   public.user_in_workspace(uuid) — STABLE boolean used by every workspace-scoped
--   RLS policy. Lives in `public` because Supabase locks the `auth` schema
--   (CREATE inside `auth` returns 42501 to project owners). Calls `auth.uid()`
--   internally — that function is owned by Supabase and is granted to everyone.
--
-- Migration / backfill:
--   This file does NOT touch existing data. After running it, paste + run
--   `lib/supabase/schema-tenancy-backfill.sql` (with your WORKSPACE_ID UUID
--   substituted on the `ws_id :=` line) to bind the legacy single-tenant rows
--   to a real `workspaces` row.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---- workspaces ----------------------------------------------------------------
-- The legacy schema may already have a stub `workspaces` table (only an `id`
-- column) tied to the WORKSPACE_ID env value. We additively bring it up to spec
-- with ADD COLUMN IF NOT EXISTS, backfill nulls so we can apply the constraints,
-- then add NOT NULL + UNIQUE last.
CREATE TABLE IF NOT EXISTS workspaces (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                     text,
  name                     text,
  onboarding_completed_at  timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS slug                    text;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS name                    text;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS created_at              timestamptz NOT NULL DEFAULT now();

UPDATE workspaces SET name = COALESCE(name, 'Workspace ' || left(id::text, 8));
UPDATE workspaces SET slug = COALESCE(slug, 'ws-' || left(id::text, 8));

ALTER TABLE workspaces ALTER COLUMN slug SET NOT NULL;
ALTER TABLE workspaces ALTER COLUMN name SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.workspaces'::regclass
      AND conname = 'workspaces_slug_key'
  ) THEN
    ALTER TABLE workspaces ADD CONSTRAINT workspaces_slug_key UNIQUE (slug);
  END IF;
END $$;

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

-- Helper used by RLS policies. STABLE so PostgREST can cache the result for the
-- life of the request. SECURITY DEFINER so the policy check runs with the
-- function owner's rights and avoids recursive RLS evaluation against
-- workspace_members itself.
--
-- NOTE: lives in `public`, not `auth`. The `auth` schema is owned by Supabase
-- and rejects user-issued CREATE statements with `42501: permission denied`.
CREATE OR REPLACE FUNCTION public.user_in_workspace(ws uuid)
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

GRANT EXECUTE ON FUNCTION public.user_in_workspace(uuid) TO authenticated, anon;

-- ---- RLS on the tenancy tables themselves --------------------------------------
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workspaces_member_read ON workspaces;
CREATE POLICY workspaces_member_read ON workspaces
  FOR SELECT TO authenticated
  USING (public.user_in_workspace(id));

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
  USING (public.user_in_workspace(workspace_id));

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
  USING (public.user_in_workspace(workspace_id));

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

-- ---- Backfill (run as a separate snippet; see schema-tenancy-backfill.sql) -----
-- This file does NOT touch your existing data. To bind the legacy single-tenant
-- rows to a real workspaces row, paste the snippet in
-- `lib/supabase/schema-tenancy-backfill.sql` with your WORKSPACE_ID env UUID
-- substituted in, then run it.
