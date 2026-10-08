CREATE OR REPLACE FUNCTION public.seth_save_dm_draft(p_id text, p_dm text, p_note text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_email text; v_row public.creators%ROWTYPE; v_dm text := nullif(btrim(coalesce(p_dm,'')),'');
BEGIN
  IF NOT public.is_creator_approver() THEN RAISE EXCEPTION 'Forbidden: approver only'; END IF;
  IF v_dm IS NULL THEN RAISE EXCEPTION 'Draft DM is empty'; END IF;
  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();
  SELECT * INTO v_row FROM public.creators WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Creator not found'; END IF;
  IF v_row.contacted_date IS NOT NULL OR v_row.outreach_sent_at IS NOT NULL THEN RAISE EXCEPTION 'Already contacted — DM is locked'; END IF;
  IF v_row.seth_approval_status IS NOT NULL THEN RAISE EXCEPTION 'Already decided — undo back to review before editing the DM'; END IF;
  IF v_dm IS NOT DISTINCT FROM v_row.personalized_dm THEN RETURN jsonb_build_object('ok', true, 'unchanged', true); END IF;
  UPDATE public.creators SET
    personalized_dm = left(v_dm, 2000),
    seth_approval_history = coalesce(seth_approval_history,'[]'::jsonb) || jsonb_build_object(
      'at', now(), 'by', v_email, 'decision', 'dm_draft', 'note', left(coalesce(p_note,''),1000),
      'previous_status', v_row.seth_approval_status, 'previous_dm', v_row.personalized_dm)
  WHERE id = p_id;
  RETURN jsonb_build_object('ok', true);
END $$;
REVOKE ALL ON FUNCTION public.seth_save_dm_draft(text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seth_save_dm_draft(text,text,text) TO authenticated;