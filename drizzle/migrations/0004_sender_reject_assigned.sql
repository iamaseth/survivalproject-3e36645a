CREATE OR REPLACE FUNCTION public.guard_seth_approval()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
 IF current_user IN ('authenticated','anon') OR auth.role() IN ('authenticated','anon') THEN
  IF (NEW.seth_approval_status IS DISTINCT FROM OLD.seth_approval_status OR NEW.seth_approved_by IS DISTINCT FROM OLD.seth_approved_by
   OR NEW.seth_approved_at IS DISTINCT FROM OLD.seth_approved_at OR NEW.seth_approval_note IS DISTINCT FROM OLD.seth_approval_note
   OR NEW.seth_approval_history IS DISTINCT FROM OLD.seth_approval_history) AND NOT public.is_creator_approver()
   -- Narrow exception: sender_reject_assigned may only move approved -> rejected.
   AND NOT (coalesce(current_setting('app.sender_reject', true),'') = 'on'
            AND OLD.seth_approval_status = 'approved' AND NEW.seth_approval_status = 'rejected'
            AND NEW.seth_approved_by IS NOT DISTINCT FROM OLD.seth_approved_by
            AND NEW.seth_approved_at IS NOT DISTINCT FROM OLD.seth_approved_at)
  THEN RAISE EXCEPTION 'Only the designated approver can change Seth approval'; END IF;
  IF NEW.seth_approval_status = 'approved' AND (NEW.seth_approval_status IS DISTINCT FROM OLD.seth_approval_status OR NEW.personalized_dm IS DISTINCT FROM OLD.personalized_dm) THEN
   IF NEW.contacted_date IS NOT NULL OR NEW.outreach_sent_at IS NOT NULL OR NEW.qualification_status IS DISTINCT FROM 'Qualified'
    OR coalesce(NEW.tiktok,'') !~* '^https://(www\.)?tiktok\.com/@[A-Za-z0-9._-]+/?$'
    OR coalesce(NEW.response_followup,'') ~* 'not relevant|dm blocked|do not contact|do not send'
    OR NOT public.creator_final_research_valid(NEW.full_verification,NEW.verification_evidence,NEW.verification_date::text,NEW.personalized_dm)
    THEN RAISE EXCEPTION 'Direct research and a grounded DM are required for approval'; END IF;
  END IF;
 END IF;
 RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.sender_reject_assigned(p_id text, p_reason text, p_checked_profile boolean)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE r public.creators%ROWTYPE; me text; who text;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
 me := public.outreach_my_sender();
 IF me IS NULL THEN RAISE EXCEPTION 'Not an outreach sender'; END IF;
 IF NOT coalesce(p_checked_profile,false) THEN RAISE EXCEPTION 'Confirm that you reviewed the correct profile'; END IF;
 SELECT email INTO who FROM auth.users WHERE id = auth.uid();
 SELECT * INTO r FROM public.creators WHERE id = p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Creator not found'; END IF;
 IF r.outreach_assignee IS DISTINCT FROM me THEN RAISE EXCEPTION 'Creator is not assigned to you'; END IF;
 IF r.seth_approval_status IS DISTINCT FROM 'approved' THEN RAISE EXCEPTION 'Creator is not in the approved queue'; END IF;
 IF r.outreach_sent_at IS NOT NULL OR r.contacted_date IS NOT NULL THEN RAISE EXCEPTION 'Already contacted; history is kept unchanged'; END IF;
 PERFORM set_config('app.sender_reject','on',true);
 PERFORM set_config('app.outreach_rpc','on',true);
 UPDATE public.creators SET
   seth_approval_status = 'rejected',
   seth_approval_note = left('Rejected from ' || me || ' queue: ' || coalesce(nullif(btrim(p_reason),''),'Not Relevant'), 500),
   seth_approval_history = coalesce(seth_approval_history,'[]'::jsonb) || jsonb_build_object(
     'at', now(), 'by', who, 'sender', me, 'event', 'sender_queue_rejection', 'checked_profile', true,
     'reason', p_reason, 'previous_status', r.seth_approval_status,
     'previous_qualification', r.qualification_status, 'previous_followup', r.response_followup),
   qualification_status = 'Not Relevant',
   response_followup = CASE WHEN coalesce(btrim(r.response_followup),'') = '' THEN 'Not Relevant'
                            ELSE 'Not Relevant — ' || r.response_followup END,
   outreach_assignee = NULL, outreach_claimed_at = NULL
 WHERE id = p_id;
 PERFORM set_config('app.sender_reject','off',true);
 PERFORM set_config('app.outreach_rpc','off',true);
 RETURN jsonb_build_object('ok', true, 'sender', me);
END $function$;

REVOKE ALL ON FUNCTION public.sender_reject_assigned(text,text,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sender_reject_assigned(text,text,boolean) TO authenticated;