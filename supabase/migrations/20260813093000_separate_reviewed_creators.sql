-- Reviewed Survival Tabs/MRE creators are a different workflow and must not
-- appear in or modify the main emerging-creator CRM.

CREATE TABLE IF NOT EXISTS public.reviewed_creators
  (LIKE public.creators INCLUDING ALL);

ALTER TABLE public.reviewed_creators ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='reviewed_creators' AND policyname='team can read reviewed creators') THEN
    CREATE POLICY "team can read reviewed creators" ON public.reviewed_creators FOR SELECT USING (private.is_team_member(auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='reviewed_creators' AND policyname='team can insert reviewed creators') THEN
    CREATE POLICY "team can insert reviewed creators" ON public.reviewed_creators FOR INSERT WITH CHECK (private.is_team_member(auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='reviewed_creators' AND policyname='team can update reviewed creators') THEN
    CREATE POLICY "team can update reviewed creators" ON public.reviewed_creators FOR UPDATE USING (private.is_team_member(auth.uid())) WITH CHECK (private.is_team_member(auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='reviewed_creators' AND policyname='team can delete reviewed creators') THEN
    CREATE POLICY "team can delete reviewed creators" ON public.reviewed_creators FOR DELETE USING (private.is_team_member(auth.uid()));
  END IF;
END $$;

INSERT INTO public.reviewed_creators
SELECT * FROM public.creators
WHERE segment = 'Reviewed Survival Tabs and MRE'
ON CONFLICT (id) DO NOTHING;

DELETE FROM public.creators
WHERE segment = 'Reviewed Survival Tabs and MRE';
