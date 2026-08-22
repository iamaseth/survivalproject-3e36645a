CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE IF NOT EXISTS private.ingest_tokens (
  name text PRIMARY KEY,
  token_sha256 text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON SCHEMA private FROM anon, authenticated;
REVOKE ALL ON private.ingest_tokens FROM anon, authenticated;
GRANT USAGE ON SCHEMA private TO service_role;
GRANT ALL ON private.ingest_tokens TO service_role;
ALTER TABLE private.ingest_tokens ENABLE ROW LEVEL SECURITY;

INSERT INTO private.ingest_tokens (name, token_sha256)
VALUES ('youtube_ingest', '9c6e591abe44b245ff6fc55b2df1fbaebf6a0ceb5419d04772ffa1b661c1c6e2')
ON CONFLICT (name) DO UPDATE SET token_sha256 = EXCLUDED.token_sha256;

CREATE OR REPLACE FUNCTION private.verify_ingest_token(_name text, _hash text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = private
AS $$
  SELECT EXISTS (SELECT 1 FROM private.ingest_tokens WHERE name = _name AND token_sha256 = _hash);
$$;

REVOKE ALL ON FUNCTION private.verify_ingest_token(text, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.verify_ingest_token(text, text) TO service_role;