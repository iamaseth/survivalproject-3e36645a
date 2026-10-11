ALTER TABLE public.influencer_research_staging ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.influencer_research_staging FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.influencer_research_staging TO authenticated;
GRANT ALL ON public.influencer_research_staging TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
CREATE POLICY "Research team can read staging" ON public.influencer_research_staging FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role IN ('executive','research_manager','partnership_manager','partnership_coordinator')));
CREATE POLICY "Research team can add staging" ON public.influencer_research_staging FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role IN ('executive','research_manager','partnership_manager','partnership_coordinator')));
CREATE POLICY "Research team can fill missing markdown" ON public.influencer_research_staging FOR UPDATE TO authenticated
  USING (md_content IS NULL AND EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role IN ('executive','research_manager','partnership_manager','partnership_coordinator')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role IN ('executive','research_manager','partnership_manager','partnership_coordinator')));