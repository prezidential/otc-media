-- Phase 2A — one-shot backfill for the legacy single-tenant data.
--
-- Replace the UUID literal in WS_ID below with the value of the WORKSPACE_ID
-- env var in your `.env.local`, then paste + run this file in the Supabase
-- SQL editor (or via psql).
--
-- Idempotent: safe to re-run. Every existing auth.users row becomes an `owner`
-- of the new "default" workspace.
--
-- Run after schema-tenancy.sql.

DO $$
DECLARE
  ws_id uuid := '11111111-2222-3333-4444-555555555555'::uuid;  -- <-- EDIT ME
BEGIN
  IF ws_id = '11111111-2222-3333-4444-555555555555'::uuid THEN
    RAISE EXCEPTION
      'Edit ws_id in schema-tenancy-backfill.sql to match your WORKSPACE_ID env value.';
  END IF;

  INSERT INTO public.workspaces (id, slug, name, onboarding_completed_at)
  VALUES (ws_id, 'default', 'Default workspace', now())
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  SELECT ws_id, u.id, 'owner'
  FROM auth.users u
  ON CONFLICT (workspace_id, user_id) DO NOTHING;

  RAISE NOTICE 'Backfill complete for workspace %.', ws_id;
END $$;
