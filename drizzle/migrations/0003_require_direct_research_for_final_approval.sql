CREATE OR REPLACE FUNCTION public.creator_final_research_valid(p_verification text, p_evidence text, p_date text, p_dm text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public AS $$
 SELECT coalesce(p_verification LIKE 'Verified for TikTok DM%', false)
 AND length(btrim(coalesce(p_evidence,''))) >= 40
 AND nullif(btrim(coalesce(p_date,'')),'') IS NOT NULL
 AND length(btrim(coalesce(p_dm,''))) BETWEEN 1 AND 2000
 AND coalesce(p_dm,'') !~* 'natural fit for the preparedness content you already share|I came across your content|your preparedness content|^[[:space:]]*(NOT RELEVANT|NEEDS MANUAL REVIEW)'
 AND (SELECT count(DISTINCT word) FROM regexp_split_to_table(lower(coalesce(p_evidence,'')), '[^a-z]+') AS words(word)
      WHERE length(word) >= 5 AND word IN (SELECT regexp_split_to_table(lower(coalesce(p_dm,'')), '[^a-z]+'))) >= 2;
$$;
REVOKE ALL ON FUNCTION public.creator_final_research_valid(text,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.creator_final_research_valid(text,text,text,text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.seth_review_creator(p_id text, p_decision text, p_dm text, p_note text, p_checked_profile boolean, p_message_fits boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_email text; v_row public.creators%ROWTYPE; v_dm text; v_entry jsonb;
BEGIN
 IF NOT public.is_creator_approver() THEN RAISE EXCEPTION 'Forbidden: approver only'; END IF;
 IF p_decision IS NULL OR p_decision NOT IN ('approved','rejected','cleared') THEN RAISE EXCEPTION 'Invalid decision'; END IF;
 SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();
 SELECT * INTO v_row FROM public.creators WHERE id = p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Creator not found'; END IF;
 IF v_row.contacted_date IS NOT NULL OR v_row.outreach_sent_at IS NOT NULL THEN RAISE EXCEPTION 'Already contacted — review locked'; END IF;
 IF p_decision <> 'cleared' AND v_row.seth_approval_status IS NOT NULL THEN RAISE EXCEPTION 'Already decided — undo first'; END IF;
 v_dm := btrim(coalesce(p_dm, v_row.personalized_dm, ''));
 IF p_decision = 'approved' THEN
  IF v_row.qualification_status IS DISTINCT FROM 'Qualified' OR coalesce(v_row.tiktok,'') !~* '^https://(www\.)?tiktok\.com/@[A-Za-z0-9._-]+/?$' THEN RAISE EXCEPTION 'Not eligible for final approval'; END IF;
  IF coalesce(v_row.response_followup,'') ~* 'not relevant|dm blocked|do not contact|do not send' THEN RAISE EXCEPTION 'Blocked from outreach'; END IF;
  IF NOT public.creator_final_research_valid(v_row.full_verification, v_row.verification_evidence, v_row.verification_date::text, v_row.personalized_dm) THEN RAISE EXCEPTION 'Direct profile research and a grounded saved DM are required before final approval'; END IF;
  IF NOT public.creator_final_research_valid(v_row.full_verification, v_row.verification_evidence, v_row.verification_date::text, v_dm) THEN RAISE EXCEPTION 'DM must remain specific to the documented profile evidence'; END IF;
 END IF;
 v_entry := jsonb_build_object('at', now(), 'by', v_email, 'decision', p_decision, 'note', left(coalesce(p_note,''),1000),
  'previous_status', v_row.seth_approval_status, 'previous_dm', CASE WHEN p_decision = 'approved' AND v_dm IS DISTINCT FROM v_row.personalized_dm THEN v_row.personalized_dm END,
  'research_evidence', v_row.verification_evidence, 'research_verification', v_row.full_verification, 'research_date', v_row.verification_date);
 UPDATE public.creators SET personalized_dm = CASE WHEN p_decision = 'approved' THEN v_dm ELSE personalized_dm END,
  seth_approval_status = CASE WHEN p_decision = 'cleared' THEN NULL ELSE p_decision END,
  seth_approved_by = v_email, seth_approved_at = now(), seth_approval_note = left(coalesce(p_note,''),1000),
  seth_approval_history = coalesce(seth_approval_history,'[]'::jsonb) || v_entry WHERE id = p_id;
 RETURN jsonb_build_object('ok',true);
END $$;
REVOKE ALL ON FUNCTION public.seth_review_creator(text,text,text,text,boolean,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seth_review_creator(text,text,text,text,boolean,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_seth_approval()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 IF current_user IN ('authenticated','anon') OR auth.role() IN ('authenticated','anon') THEN
  IF (NEW.seth_approval_status IS DISTINCT FROM OLD.seth_approval_status OR NEW.seth_approved_by IS DISTINCT FROM OLD.seth_approved_by
   OR NEW.seth_approved_at IS DISTINCT FROM OLD.seth_approved_at OR NEW.seth_approval_note IS DISTINCT FROM OLD.seth_approval_note
   OR NEW.seth_approval_history IS DISTINCT FROM OLD.seth_approval_history) AND NOT public.is_creator_approver() THEN RAISE EXCEPTION 'Only the designated approver can change Seth approval'; END IF;
  IF NEW.seth_approval_status = 'approved' AND (NEW.seth_approval_status IS DISTINCT FROM OLD.seth_approval_status OR NEW.personalized_dm IS DISTINCT FROM OLD.personalized_dm) THEN
   IF NEW.contacted_date IS NOT NULL OR NEW.outreach_sent_at IS NOT NULL OR NEW.qualification_status IS DISTINCT FROM 'Qualified'
    OR coalesce(NEW.tiktok,'') !~* '^https://(www\.)?tiktok\.com/@[A-Za-z0-9._-]+/?$'
    OR coalesce(NEW.response_followup,'') ~* 'not relevant|dm blocked|do not contact|do not send'
    OR NOT public.creator_final_research_valid(NEW.full_verification,NEW.verification_evidence,NEW.verification_date::text,NEW.personalized_dm)
    THEN RAISE EXCEPTION 'Direct research and a grounded DM are required for approval'; END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.guard_seth_approval_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 IF auth.role() IN ('authenticated','anon') AND NEW.seth_approval_status IS NOT NULL THEN
  IF NOT public.is_creator_approver() THEN RAISE EXCEPTION 'Only the designated approver can set Seth approval'; END IF;
  IF NEW.seth_approval_status = 'approved' THEN RAISE EXCEPTION 'Create research first, then use final approval'; END IF;
 END IF;
 RETURN NEW;
END $$;