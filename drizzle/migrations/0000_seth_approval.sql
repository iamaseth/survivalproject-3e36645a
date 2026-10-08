-- Seth approval gate for Rena's TikTok DM queue. Additive only.
ALTER TABLE public.creators
  ADD COLUMN IF NOT EXISTS seth_approval_status text,
  ADD COLUMN IF NOT EXISTS seth_approved_by text,
  ADD COLUMN IF NOT EXISTS seth_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS seth_approval_note text,
  ADD COLUMN IF NOT EXISTS seth_approval_history jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS public.creator_approvers (
  email text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.creator_approvers TO service_role;
ALTER TABLE public.creator_approvers ENABLE ROW LEVEL SECURITY;
-- No policies: no anon/authenticated access at all.

INSERT INTO public.creator_approvers(email) VALUES ('thenxyz@gmail.com') ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.is_creator_approver()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users u JOIN public.creator_approvers a ON lower(a.email) = lower(u.email)
    WHERE u.id = auth.uid() AND u.email_confirmed_at IS NOT NULL
  )
$$;
REVOKE ALL ON FUNCTION public.is_creator_approver() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_creator_approver() TO authenticated;

-- Block any direct change to approval columns by non-approvers.
CREATE OR REPLACE FUNCTION public.guard_seth_approval()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF current_user IN ('authenticated','anon') OR auth.role() IN ('authenticated','anon') THEN
    IF (NEW.seth_approval_status IS DISTINCT FROM OLD.seth_approval_status
        OR NEW.seth_approved_by IS DISTINCT FROM OLD.seth_approved_by
        OR NEW.seth_approved_at IS DISTINCT FROM OLD.seth_approved_at
        OR NEW.seth_approval_note IS DISTINCT FROM OLD.seth_approval_note
        OR NEW.seth_approval_history IS DISTINCT FROM OLD.seth_approval_history)
       AND NOT public.is_creator_approver() THEN
      RAISE EXCEPTION 'Only the designated approver can change Seth approval';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_seth_approval ON public.creators;
CREATE TRIGGER trg_guard_seth_approval BEFORE UPDATE ON public.creators
  FOR EACH ROW EXECUTE FUNCTION public.guard_seth_approval();

CREATE OR REPLACE FUNCTION public.guard_seth_approval_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.role() IN ('authenticated','anon') AND NEW.seth_approval_status IS NOT NULL AND NOT public.is_creator_approver() THEN
    RAISE EXCEPTION 'Only the designated approver can set Seth approval';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_seth_approval_ins ON public.creators;
CREATE TRIGGER trg_guard_seth_approval_ins BEFORE INSERT ON public.creators
  FOR EACH ROW EXECUTE FUNCTION public.guard_seth_approval_insert();

-- The only write path for approvals.
CREATE OR REPLACE FUNCTION public.seth_review_creator(
  p_id text, p_decision text, p_dm text, p_note text, p_checked_profile boolean, p_message_fits boolean
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_email text; v_row public.creators%ROWTYPE; v_dm text := nullif(btrim(coalesce(p_dm,'')),''); v_entry jsonb;
BEGIN
  IF NOT public.is_creator_approver() THEN RAISE EXCEPTION 'Forbidden: approver only'; END IF;
  IF p_decision NOT IN ('approved','rejected','cleared') THEN RAISE EXCEPTION 'Invalid decision'; END IF;
  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();
  SELECT * INTO v_row FROM public.creators WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Creator not found'; END IF;
  IF p_decision = 'approved' THEN
    IF NOT coalesce(p_checked_profile,false) OR NOT coalesce(p_message_fits,false) THEN RAISE EXCEPTION 'Both confirmations required'; END IF;
    IF coalesce(v_dm, nullif(btrim(coalesce(v_row.personalized_dm,'')),'')) IS NULL THEN RAISE EXCEPTION 'A personalized DM is required'; END IF;
    IF v_row.contacted_date IS NOT NULL THEN RAISE EXCEPTION 'Already contacted'; END IF;
  END IF;
  v_entry := jsonb_build_object('at', now(), 'by', v_email, 'decision', p_decision, 'note', left(coalesce(p_note,''),1000),
    'previous_status', v_row.seth_approval_status,
    'previous_dm', CASE WHEN v_dm IS NOT NULL AND v_dm IS DISTINCT FROM v_row.personalized_dm THEN v_row.personalized_dm END);
  UPDATE public.creators SET
    personalized_dm = CASE WHEN p_decision = 'approved' AND v_dm IS NOT NULL THEN left(v_dm, 2000) ELSE personalized_dm END,
    seth_approval_status = CASE WHEN p_decision = 'cleared' THEN NULL ELSE p_decision END,
    seth_approved_by = v_email, seth_approved_at = now(), seth_approval_note = left(coalesce(p_note,''),1000),
    seth_approval_history = coalesce(seth_approval_history,'[]'::jsonb) || v_entry
  WHERE id = p_id;
  RETURN jsonb_build_object('ok', true);
END $$;
REVOKE ALL ON FUNCTION public.seth_review_creator(text,text,text,text,boolean,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seth_review_creator(text,text,text,text,boolean,boolean) TO authenticated;