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

-- Legacy `workspaces` stub tables predate this migration and lacked a default on
-- `id`. CREATE TABLE IF NOT EXISTS won't retrofit the default, so do it
-- explicitly. Safe to re-run.
ALTER TABLE workspaces ALTER COLUMN id SET DEFAULT gen_random_uuid();

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
-- CRITICAL: must be LANGUAGE plpgsql, NOT sql. Postgres's planner inlines simple
-- SQL functions even when they're SECURITY DEFINER. Once inlined, this body
-- (which selects FROM workspace_members) becomes part of any RLS policy that
-- calls it, and the planner trips its "infinite recursion detected in policy
-- for relation \"workspace_members\"" check. plpgsql functions are never
-- inlined, so the function body stays opaque to the planner and SECURITY
-- DEFINER actually breaks the recursion.
--
-- NOTE: lives in `public`, not `auth`. The `auth` schema is owned by Supabase
-- and rejects user-issued CREATE statements with `42501: permission denied`.
CREATE OR REPLACE FUNCTION public.user_in_workspace(ws uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.workspace_members m
    WHERE m.workspace_id = ws
      AND m.user_id = auth.uid()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.user_in_workspace(uuid) TO authenticated, anon;

-- Companion helper for owner-only policies. Same plpgsql-opacity discipline as
-- user_in_workspace(): every workspace_members policy that needs to ask "is the
-- caller an owner of ws?" MUST route through this function, never an inline
-- `SELECT FROM workspace_members` in a USING/WITH CHECK clause. An inline
-- subquery on workspace_members inside any of its own policies (or inside a
-- policy on workspaces / workspace_invites whose subquery is RLS-evaluated)
-- trips Postgres's "infinite recursion detected in policy" planner check.
CREATE OR REPLACE FUNCTION public.user_is_workspace_owner(ws uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.workspace_members m
    WHERE m.workspace_id = ws
      AND m.user_id = auth.uid()
      AND m.role = 'owner'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.user_is_workspace_owner(uuid) TO authenticated, anon;

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
  USING (public.user_is_workspace_owner(id));

-- Self-read MUST NOT call user_in_workspace() — that helper queries
-- workspace_members, and Postgres's RLS recursion detector fires
-- ("infinite recursion detected in policy for relation \"workspace_members\"")
-- even though the helper is SECURITY DEFINER. A user can always read their own
-- membership rows; that's enough for /onboarding gating and the workspace
-- switcher in /api/me.
DROP POLICY IF EXISTS workspace_members_self_read ON workspace_members;
CREATE POLICY workspace_members_self_read ON workspace_members
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Separate policy for "see my peers in workspaces I belong to". Safe to use
-- the SECURITY DEFINER helper here because the recursion only matters for the
-- self_read path above — peer reads of workspace_members for workspace X are
-- guarded by membership in X (resolved by the helper without re-triggering
-- this policy for the same row).
DROP POLICY IF EXISTS workspace_members_peer_read ON workspace_members;
CREATE POLICY workspace_members_peer_read ON workspace_members
  FOR SELECT TO authenticated
  USING (public.user_in_workspace(workspace_id));

-- IMPORTANT: this is FOR ALL, so its USING expression is also OR'd into SELECT
-- evaluation. The expression therefore MUST go through the plpgsql helper —
-- an inline `SELECT FROM workspace_members` here would trip "infinite
-- recursion detected in policy" on every read of workspace_members.
DROP POLICY IF EXISTS workspace_members_owner_write ON workspace_members;
CREATE POLICY workspace_members_owner_write ON workspace_members
  FOR ALL TO authenticated
  USING (public.user_is_workspace_owner(workspace_id))
  WITH CHECK (public.user_is_workspace_owner(workspace_id));

DROP POLICY IF EXISTS workspace_invites_member_read ON workspace_invites;
CREATE POLICY workspace_invites_member_read ON workspace_invites
  FOR SELECT TO authenticated
  USING (public.user_in_workspace(workspace_id));

DROP POLICY IF EXISTS workspace_invites_owner_write ON workspace_invites;
CREATE POLICY workspace_invites_owner_write ON workspace_invites
  FOR ALL TO authenticated
  USING (public.user_is_workspace_owner(workspace_id))
  WITH CHECK (public.user_is_workspace_owner(workspace_id));

-- ---- Backfill (run as a separate snippet; see schema-tenancy-backfill.sql) -----
-- This file does NOT touch your existing data. To bind the legacy single-tenant
-- rows to a real workspaces row, paste the snippet in
-- `lib/supabase/schema-tenancy-backfill.sql` with your WORKSPACE_ID env UUID
-- substituted in, then run it.
