-- Atomic manual qualification override. Existing approval and outreach guards remain active.
CREATE OR REPLACE FUNCTION public.manual_qualification_override(
 p_id text, p_decision text, p_dm text DEFAULT NULL, p_evidence text DEFAULT NULL,
 p_assignee text DEFAULT 'Rena', p_checked_profile boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.creators%ROWTYPE; reviewer text; old_followup text;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_creator_approver() THEN RAISE EXCEPTION 'Approver required'; END IF;
 IF p_decision NOT IN ('approved','rejected') THEN RAISE EXCEPTION 'Invalid decision'; END IF;
 SELECT email INTO reviewer FROM auth.users WHERE id=auth.uid();
 SELECT * INTO r FROM public.creators WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Creator not found'; END IF;
 IF r.contacted_date IS NOT NULL OR r.outreach_sent_at IS NOT NULL THEN RAISE EXCEPTION 'Already contacted'; END IF;
 IF r.seth_approval_status IS NOT NULL THEN RAISE EXCEPTION 'Already manually decided; use the existing undo process'; END IF;
 IF coalesce(r.response_followup,'') ~* 'dm blocked|do not contact|do not send|opt.?out|unsubscribe' THEN
  RAISE EXCEPTION 'Explicit outreach restriction must be reviewed separately';
 END IF;
 IF p_decision='approved' THEN
  IF NOT p_checked_profile OR length(btrim(coalesce(p_evidence,''))) < 40 THEN
   RAISE EXCEPTION 'Confirmed direct profile review and evidence required';
  END IF;
  IF p_assignee NOT IN ('Seth','Rena') THEN RAISE EXCEPTION 'Invalid assignee'; END IF;
  IF coalesce(r.response_followup,'') ~* 'not relevant'
    AND lower(btrim(r.response_followup)) <> 'not relevant' THEN
    RAISE EXCEPTION 'Mixed follow-up notes need separate review; not cleared';
  END IF;
  IF NOT public.creator_final_research_valid(r.full_verification,p_evidence,r.verification_date::text,p_dm) OR NOT public.creator_final_research_valid(r.full_verification,r.verification_evidence,r.verification_date::text,r.personalized_dm) THEN
    RAISE EXCEPTION 'Verified research and grounded DM required';
  END IF;
 END IF;
 -- Preserve the prior automated status and follow-up before replacing either.
 UPDATE public.creators SET
   seth_approval_history=coalesce(seth_approval_history,'[]'::jsonb) ||
     jsonb_build_object('at',now(),'by',reviewer,'event','manual_override_of_automated_qualification',
       'previous_qualification',r.qualification_status,'previous_followup',r.response_followup)
 WHERE id=p_id;
 IF p_decision='approved' THEN
   UPDATE public.creators SET qualification_status='Qualified',
     response_followup=CASE WHEN lower(btrim(coalesce(r.response_followup,'')))='not relevant' THEN NULL ELSE r.response_followup END
   WHERE id=p_id;
   PERFORM public.seth_review_creator(p_id,'approved',p_dm,'Manual review overrides automated classification',true,true);
   PERFORM public.outreach_action(p_id,'assign',p_assignee);
 ELSE
   PERFORM public.seth_review_creator(p_id,'rejected',NULL,'Manual rejection overrides automated classification',false,false);
   UPDATE public.creators SET qualification_status='Not Relevant',
     outreach_assignee=NULL,outreach_claimed_at=NULL WHERE id=p_id;
 END IF;
 RETURN jsonb_build_object('ok',true,'decision',p_decision);
END $$;
REVOKE ALL ON FUNCTION public.manual_qualification_override(text,text,text,text,text,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manual_qualification_override(text,text,text,text,text,boolean) TO authenticated;
