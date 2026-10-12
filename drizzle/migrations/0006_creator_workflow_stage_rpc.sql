CREATE OR REPLACE FUNCTION public.sync_creator_workflow_status()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $function$ BEGIN
 -- Actual sending/contact always wins.
 IF NEW.outreach_sent_at IS NOT NULL OR NEW.contacted_date IS NOT NULL THEN NEW.workflow_status := 'sent'; RETURN NEW; END IF;
 -- An explicit stage change through set_creator_workflow_stage is authoritative.
 IF coalesce(current_setting('app.workflow_stage', true),'') = 'on' THEN RETURN NEW; END IF;
 IF TG_OP = 'UPDATE' AND NEW.seth_approval_status IS NOT DISTINCT FROM OLD.seth_approval_status
    AND NEW.outreach_second_look_at IS NOT DISTINCT FROM OLD.outreach_second_look_at
    AND OLD.workflow_status IS NOT NULL AND OLD.workflow_status <> 'sent' THEN
   RETURN NEW; -- unrelated field edits never move a creator between sections
 END IF;
 IF NEW.id NOT LIKE 'bobo-md-20261010-%' AND NEW.seth_approval_status IS NULL AND NEW.outreach_second_look_at IS NULL THEN
   NEW.workflow_status := 'research';
 ELSE
   NEW.workflow_status := CASE
   WHEN NEW.seth_approval_status='rejected' THEN 'rejected'
   WHEN NEW.outreach_second_look_at IS NOT NULL THEN 'second_look'
   WHEN NEW.seth_approval_status='approved' THEN 'approved'
   WHEN NEW.id LIKE 'bobo-md-20261010-%' AND NEW.qualification_status='Not Relevant' THEN 'rejected'
   WHEN NEW.id LIKE 'bobo-md-20261010-%' AND NEW.qualification_status IN ('Qualified','Needs Review') THEN 'ai_screened'
   ELSE 'research' END;
 END IF;
 RETURN NEW; END $function$;

CREATE OR REPLACE FUNCTION public.set_creator_workflow_stage(p_id text, p_stage text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE c public.creators%ROWTYPE; actor text; dnc boolean;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
 PERFORM public.ensure_current_team_access();
 IF p_stage NOT IN ('approved','second_look','rejected','ai_screened') THEN RAISE EXCEPTION 'Invalid stage'; END IF;
 SELECT * INTO c FROM public.creators WHERE id = p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Creator not found'; END IF;
 IF c.workflow_status = 'sent' OR c.outreach_sent_at IS NOT NULL OR c.contacted_date IS NOT NULL THEN
   RAISE EXCEPTION 'Creator was already contacted; sent stage cannot be changed here'; END IF;
 IF p_stage = 'approved' THEN
   SELECT coalesce(bool_or(do_not_contact),false) INTO dnc FROM public.creator_workspace WHERE creator_id = p_id;
   IF dnc OR coalesce(c.response_followup,'') ~* 'dm blocked|do not contact|do not send' THEN
     RAISE EXCEPTION 'Creator is marked do-not-contact'; END IF;
 END IF;
 IF c.workflow_status = p_stage THEN RETURN jsonb_build_object('ok',true,'status',p_stage,'unchanged',true); END IF;
 SELECT email INTO actor FROM public.profiles WHERE id = auth.uid();
 PERFORM set_config('app.workflow_stage','on',true);
 UPDATE public.creators SET workflow_status = p_stage,
   custom_attributes = jsonb_set(coalesce(custom_attributes,'{}'::jsonb), '{workflow_history}',
     coalesce(custom_attributes->'workflow_history','[]'::jsonb) || jsonb_build_array(jsonb_build_object(
       'from', c.workflow_status, 'to', p_stage, 'by', coalesce(actor, auth.uid()::text), 'at', now(),
       'kind','workflow_stage_only')))
 WHERE id = p_id;
 PERFORM set_config('app.workflow_stage','off',true);
 RETURN jsonb_build_object('ok',true,'status',p_stage);
END $function$;
REVOKE ALL ON FUNCTION public.set_creator_workflow_stage(text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_creator_workflow_stage(text,text) TO authenticated;