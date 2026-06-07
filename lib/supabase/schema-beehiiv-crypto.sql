-- Beehiiv MCP OAuth — pgsodium encryption for Beehiiv OAuth tokens.
--
-- Mirrors schema-linkedin-crypto.sql. Apply BEFORE schema-beehiiv-oauth.sql.
-- Idempotent, safe to re-run.
--
--   1. Enables `pgsodium`.
--   2. Bootstraps a named AEAD-DET key `beehiiv_tokens_v1` (one-shot per DB).
--   3. Defines `public.beehiiv_encrypt(text)->bytea` / `public.beehiiv_decrypt(bytea)->text`
--      (SECURITY DEFINER, NULL-safe). Associated data is the literal 'beehiiv' so
--      the key cannot be misused across domains.
--
-- Threat model + rotation notes: identical to schema-linkedin-crypto.sql.

CREATE EXTENSION IF NOT EXISTS pgsodium;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pgsodium.valid_key WHERE name = 'beehiiv_tokens_v1'
  ) THEN
    PERFORM pgsodium.create_key(
      key_type := 'aead-det',
      name     := 'beehiiv_tokens_v1'
    );
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.beehiiv_encrypt(plaintext text)
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
  WHERE name = 'beehiiv_tokens_v1'
  LIMIT 1;

  IF v_key_id IS NULL THEN
    RAISE EXCEPTION 'pgsodium key beehiiv_tokens_v1 not initialized — run schema-beehiiv-crypto.sql';
  END IF;

  RETURN pgsodium.crypto_aead_det_encrypt(
    convert_to(plaintext, 'utf8'),
    convert_to('beehiiv', 'utf8'),
    v_key_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.beehiiv_decrypt(ciphertext bytea)
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
  WHERE name = 'beehiiv_tokens_v1'
  LIMIT 1;

  IF v_key_id IS NULL THEN
    RAISE EXCEPTION 'pgsodium key beehiiv_tokens_v1 not initialized — run schema-beehiiv-crypto.sql';
  END IF;

  RETURN convert_from(
    pgsodium.crypto_aead_det_decrypt(
      ciphertext,
      convert_to('beehiiv', 'utf8'),
      v_key_id
    ),
    'utf8'
  );
END;
$$;

ALTER FUNCTION public.beehiiv_encrypt(text) OWNER TO postgres;
ALTER FUNCTION public.beehiiv_decrypt(bytea) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.beehiiv_encrypt(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.beehiiv_decrypt(bytea) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.beehiiv_encrypt(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.beehiiv_decrypt(bytea) TO authenticated;

COMMENT ON FUNCTION public.beehiiv_encrypt(text) IS
  'AEAD-DET encrypt a Beehiiv OAuth token into bytea using pgsodium key beehiiv_tokens_v1. NULL plaintext returns NULL.';
COMMENT ON FUNCTION public.beehiiv_decrypt(bytea) IS
  'Inverse of beehiiv_encrypt. SECURITY DEFINER so callers do not need pgsodium privileges. NULL ciphertext returns NULL.';
