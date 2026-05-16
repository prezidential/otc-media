-- Phase 2A M2 — pgsodium-based encryption for LinkedIn OAuth tokens.
--
-- This file MUST be applied BEFORE re-running `schema-linkedin.sql` on an
-- existing deploy whose `linkedin_connections.access_token` / `refresh_token`
-- columns are still `text`. The column-type migration in `schema-linkedin.sql`
-- references `public.linkedin_encrypt(...)` in its `USING` clause.
--
-- What this file does (idempotent, safe to re-run):
--   1. Enables the `pgsodium` extension.
--   2. Bootstraps a single named AEAD-deterministic key
--      (`linkedin_tokens_v1`) in `pgsodium.key`. Bootstrap is one-shot per DB —
--      once the key exists, re-running this file is a no-op.
--   3. Defines `public.linkedin_encrypt(text) -> bytea` and
--      `public.linkedin_decrypt(bytea) -> text` helpers, both
--      `SECURITY DEFINER` so callers don't need direct access to `pgsodium`.
--      Both functions are NULL-safe (null in -> null out) so they can be
--      used unconditionally on nullable columns (e.g. `refresh_token`).
--
-- Why deterministic AEAD: matches Supabase's documented pattern for
-- application-managed secrets and keeps ciphertext stable across reads
-- (useful for equality lookups; we don't currently use that but it's a
-- harmless side effect). Associated data is the literal `'linkedin'` so the
-- same key cannot be misused to decrypt ciphertext from a different domain.
--
-- Key rotation: not part of M2. To rotate, create a new named key
-- (`linkedin_tokens_v2`), add a second decrypt path that tries both keys,
-- re-encrypt all rows, then drop the old key. Out of scope here.
--
-- Threat model: this protects tokens at rest in DB backups, in `pg_dump`
-- output, and against a reader who has direct SELECT on the underlying table
-- but cannot call the SECURITY DEFINER decrypt function. It does NOT protect
-- against an attacker with superuser / `postgres` role access — pgsodium keys
-- are accessible to the database owner by design.

CREATE EXTENSION IF NOT EXISTS pgsodium;

-- ---- key bootstrap ------------------------------------------------------------
-- One-shot: creates the named key the first time this file runs, then
-- short-circuits. We don't store the key UUID anywhere; the helpers below
-- look it up by name on every call (cheap; `pgsodium.valid_key` is a small
-- table). This avoids embedding a UUID in source.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pgsodium.valid_key WHERE name = 'linkedin_tokens_v1'
  ) THEN
    PERFORM pgsodium.create_key(
      key_type := 'aead-det',
      name     := 'linkedin_tokens_v1'
    );
  END IF;
END $$;

-- ---- helper functions ---------------------------------------------------------
-- `linkedin_encrypt` accepts plaintext (or NULL) and returns the AEAD-DET
-- ciphertext as bytea. Associated data is fixed to the byte string 'linkedin'
-- so the same key can't accidentally be used to decrypt non-LinkedIn ciphertext.
CREATE OR REPLACE FUNCTION public.linkedin_encrypt(plaintext text)
RETURNS bytea
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pgsodium
AS $$
DECLARE
  v_key_id uuid;
BEGIN
  IF plaintext IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT id INTO v_key_id
  FROM pgsodium.valid_key
  WHERE name = 'linkedin_tokens_v1'
  LIMIT 1;

  IF v_key_id IS NULL THEN
    RAISE EXCEPTION 'pgsodium key linkedin_tokens_v1 not initialized — run schema-linkedin-crypto.sql';
  END IF;

  RETURN pgsodium.crypto_aead_det_encrypt(
    convert_to(plaintext, 'utf8'),
    convert_to('linkedin', 'utf8'),
    v_key_id
  );
END;
$$;

-- `linkedin_decrypt` is the inverse. NULL passthrough on `refresh_token` rows.
CREATE OR REPLACE FUNCTION public.linkedin_decrypt(ciphertext bytea)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pgsodium
AS $$
DECLARE
  v_key_id uuid;
BEGIN
  IF ciphertext IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT id INTO v_key_id
  FROM pgsodium.valid_key
  WHERE name = 'linkedin_tokens_v1'
  LIMIT 1;

  IF v_key_id IS NULL THEN
    RAISE EXCEPTION 'pgsodium key linkedin_tokens_v1 not initialized — run schema-linkedin-crypto.sql';
  END IF;

  RETURN convert_from(
    pgsodium.crypto_aead_det_decrypt(
      ciphertext,
      convert_to('linkedin', 'utf8'),
      v_key_id
    ),
    'utf8'
  );
END;
$$;

-- Lock down ownership; SECURITY DEFINER means the function executes as its
-- owner. We want that owner to be the high-privilege role that has access to
-- pgsodium (typically `postgres` in Supabase).
ALTER FUNCTION public.linkedin_encrypt(text) OWNER TO postgres;
ALTER FUNCTION public.linkedin_decrypt(bytea) OWNER TO postgres;

-- Block PUBLIC from running these (defense in depth); we grant only to the
-- `authenticated` Supabase role, which is the role used by RLS-aware client
-- queries. Service role implicitly has access.
REVOKE ALL ON FUNCTION public.linkedin_encrypt(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.linkedin_decrypt(bytea) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.linkedin_encrypt(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.linkedin_decrypt(bytea) TO authenticated;

COMMENT ON FUNCTION public.linkedin_encrypt(text) IS
  'AEAD-DET encrypt a LinkedIn OAuth token plaintext into bytea ciphertext, using the pgsodium key named linkedin_tokens_v1. NULL plaintext returns NULL.';
COMMENT ON FUNCTION public.linkedin_decrypt(bytea) IS
  'Inverse of linkedin_encrypt. SECURITY DEFINER so callers do not need direct pgsodium privileges. NULL ciphertext returns NULL.';
