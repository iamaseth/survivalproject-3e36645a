CREATE TABLE public.youtube_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id text NOT NULL,
  channel_url text,
  channel_title text,
  subscriber_count integer,
  video_count integer,
  country text,
  description_email text,
  business_email text,
  topic_keyword text,
  last_upload_at timestamptz,
  source text NOT NULL DEFAULT 'apps_script',
  source_batch_id text,
  status text NOT NULL DEFAULT 'pending',
  email_status text NOT NULL DEFAULT 'none',
  promoted_creator_id text,
  notes text,
  reviewed_at timestamptz,
  reviewed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT youtube_candidates_status_check CHECK (status IN ('pending','kept','skipped')),
  CONSTRAINT youtube_candidates_email_status_check CHECK (email_status IN ('none','found','verified','invalid','suppressed'))
);

CREATE UNIQUE INDEX youtube_candidates_channel_id_key ON public.youtube_candidates (channel_id);
CREATE INDEX youtube_candidates_status_idx ON public.youtube_candidates (status);
CREATE INDEX youtube_candidates_subs_idx ON public.youtube_candidates (subscriber_count);
CREATE INDEX youtube_candidates_email_status_idx ON public.youtube_candidates (email_status);

GRANT SELECT, UPDATE ON public.youtube_candidates TO authenticated;
GRANT ALL ON public.youtube_candidates TO service_role;

ALTER TABLE public.youtube_candidates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team can view youtube candidates"
  ON public.youtube_candidates FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()));

CREATE POLICY "Team can review youtube candidates"
  ON public.youtube_candidates FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()));

CREATE POLICY "No client inserts on youtube candidates"
  ON public.youtube_candidates AS RESTRICTIVE FOR INSERT TO authenticated, anon
  WITH CHECK (false);

CREATE POLICY "No client deletes on youtube candidates"
  ON public.youtube_candidates AS RESTRICTIVE FOR DELETE TO authenticated, anon
  USING (false);

CREATE TRIGGER youtube_candidates_set_updated_at
  BEFORE UPDATE ON public.youtube_candidates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.creators
  ADD COLUMN IF NOT EXISTS youtube_channel_id text,
  ADD COLUMN IF NOT EXISTS subscriber_count integer;

CREATE UNIQUE INDEX creators_youtube_channel_id_key
  ON public.creators (youtube_channel_id)
  WHERE youtube_channel_id IS NOT NULL AND youtube_channel_id <> '';

UPDATE public.creators
SET youtube_channel_id = substring(youtube from 'youtube\.com/channel/(UC[0-9A-Za-z_-]{22})')
WHERE youtube_channel_id IS NULL
  AND youtube ~ 'youtube\.com/channel/UC[0-9A-Za-z_-]{22}';