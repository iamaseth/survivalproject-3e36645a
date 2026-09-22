CREATE TABLE public.bobo_research_progress (
  user_id uuid PRIMARY KEY,
  current_index integer NOT NULL DEFAULT 0,
  done_terms jsonb NOT NULL DEFAULT '[]'::jsonb,
  per_term jsonb NOT NULL DEFAULT '{}'::jsonb,
  recent jsonb NOT NULL DEFAULT '{}'::jsonb,
  saved_handles jsonb NOT NULL DEFAULT '{}'::jsonb,
  total_saved integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.bobo_research_progress TO authenticated;
GRANT ALL ON public.bobo_research_progress TO service_role;

ALTER TABLE public.bobo_research_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own bobo progress" ON public.bobo_research_progress
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own bobo progress" ON public.bobo_research_progress
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own bobo progress" ON public.bobo_research_progress
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER bobo_research_progress_set_updated_at
  BEFORE UPDATE ON public.bobo_research_progress
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();