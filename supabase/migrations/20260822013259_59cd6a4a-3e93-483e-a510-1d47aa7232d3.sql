CREATE TABLE IF NOT EXISTS public.ingest_tokens (
  name text PRIMARY KEY,
  token_sha256 text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON public.ingest_tokens FROM anon, authenticated;
GRANT ALL ON public.ingest_tokens TO service_role;
ALTER TABLE public.ingest_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ingest_tokens_no_client_access"
  ON public.ingest_tokens AS RESTRICTIVE FOR ALL
  TO anon, authenticated
  USING (false) WITH CHECK (false);

INSERT INTO public.ingest_tokens (name, token_sha256)
VALUES ('youtube_ingest', '9c6e591abe44b245ff6fc55b2df1fbaebf6a0ceb5419d04772ffa1b661c1c6e2')
ON CONFLICT (name) DO UPDATE SET token_sha256 = EXCLUDED.token_sha256;

DROP TABLE IF EXISTS private.ingest_tokens;
DROP SCHEMA IF EXISTS private CASCADE;