ALTER TABLE public.creators
  ADD COLUMN IF NOT EXISTS outreach_assignee text,
  ADD COLUMN IF NOT EXISTS outreach_claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS outreach_sent_by text,
  ADD COLUMN IF NOT EXISTS outreach_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS outreach_prev jsonb;

CREATE TABLE IF NOT EXISTS public.outreach_senders (
  email text PRIMARY KEY,
  sender_key text NOT NULL CHECK (sender_key IN ('Seth','BoBo','Rena')),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.outreach_senders TO service_role;
ALTER TABLE public.outreach_senders ENABLE ROW LEVEL SECURITY;
INSERT INTO public.outreach_senders(email, sender_key) VALUES
  ('thenxyz@gmail.com','Seth'), ('renas1503@gmail.com','Rena') ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.outreach_my_sender()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.sender_key FROM auth.users u JOIN public.outreach_senders s ON lower(s.email) = lower(u.email)
  WHERE u.id = auth.uid() AND u.email_confirmed_at IS NOT NULL LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.outreach_my_sender() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.outreach_my_sender() TO authenticated;

-- Direct edits to pool columns are blocked for signed-in users; RPCs below are the only path.
CREATE OR REPLACE FUNCTION public.guard_outreach_pool()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF coalesce(current_setting('app.outreach_rpc', true), '') <> 'on' AND auth.role() IN ('authenticated','anon') THEN
    IF NEW.outreach_assignee IS DISTINCT FROM OLD.outreach_assignee OR NEW.outreach_claimed_at IS DISTINCT FROM OLD.outreach_claimed_at
       OR NEW.outreach_sent_by IS DISTINCT FROM OLD.outreach_sent_by OR NEW.outreach_sent_at IS DISTINCT FROM OLD.outreach_sent_at
       OR NEW.outreach_prev IS DISTINCT FROM OLD.outreach_prev THEN
      RAISE EXCEPTION 'Outreach pool fields can only change through claim/send actions';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_outreach_pool ON public.creators;
CREATE TRIGGER trg_guard_outreach_pool BEFORE UPDATE ON public.creators
  FOR EACH ROW EXECUTE FUNCTION public.guard_outreach_pool();

CREATE OR REPLACE FUNCTION public.outreach_action(p_id text, p_action text, p_target text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me text := public.outreach_my_sender(); approver boolean := public.is_creator_approver();
  r public.creators%ROWTYPE; today text := to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD');
BEGIN
  IF me IS NULL AND NOT approver THEN RAISE EXCEPTION 'Forbidden: not an outreach sender'; END IF;
  SELECT * INTO r FROM public.creators WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Creator not found'; END IF;
  PERFORM set_config('app.outreach_rpc', 'on', true);

  IF p_action = 'claim' OR p_action = 'assign' THEN
    IF p_action = 'assign' AND NOT approver THEN RAISE EXCEPTION 'Only Seth can assign to others'; END IF;
    IF p_action = 'assign' AND p_target NOT IN ('Seth','BoBo','Rena') THEN RAISE EXCEPTION 'Unknown sender'; END IF;
    IF r.seth_approval_status IS DISTINCT FROM 'approved' THEN RAISE EXCEPTION 'Not approved by Seth'; END IF;
    IF r.contacted_date IS NOT NULL OR r.outreach_sent_at IS NOT NULL THEN RAISE EXCEPTION 'Already contacted'; END IF;
    IF coalesce(r.response_followup,'') ~* 'not relevant|dm blocked|do not contact' THEN RAISE EXCEPTION 'Blocked'; END IF;
    IF p_action = 'claim' AND r.outreach_assignee IS NOT NULL AND r.outreach_assignee <> me THEN RAISE EXCEPTION 'Already assigned to %', r.outreach_assignee; END IF;
    UPDATE public.creators SET outreach_assignee = CASE WHEN p_action = 'claim' THEN me ELSE p_target END, outreach_claimed_at = now() WHERE id = p_id;
  ELSIF p_action = 'release' THEN
    IF r.outreach_sent_at IS NOT NULL THEN RAISE EXCEPTION 'Already sent; undo first'; END IF;
    IF r.outreach_assignee IS DISTINCT FROM me AND NOT approver THEN RAISE EXCEPTION 'Not your item'; END IF;
    UPDATE public.creators SET outreach_assignee = NULL, outreach_claimed_at = NULL WHERE id = p_id;
  ELSIF p_action = 'sent' THEN
    IF me IS NULL OR r.outreach_assignee IS DISTINCT FROM me THEN RAISE EXCEPTION 'Assigned to %, not you', coalesce(r.outreach_assignee,'nobody'); END IF;
    IF r.contacted_date IS NOT NULL OR r.outreach_sent_at IS NOT NULL THEN RAISE EXCEPTION 'Already contacted'; END IF;
    IF r.seth_approval_status IS DISTINCT FROM 'approved' THEN RAISE EXCEPTION 'Not approved by Seth'; END IF;
    UPDATE public.creators SET
      outreach_prev = jsonb_build_object('contacted_date', r.contacted_date, 'contact_method', r.contact_method, 'response_followup', r.response_followup),
      contacted_date = today, contact_method = 'TikTok DM (assumed — ' || me || ')', response_followup = 'Assumed sent — unconfirmed',
      outreach_sent_by = me, outreach_sent_at = now()
    WHERE id = p_id;
  ELSIF p_action = 'undo_sent' THEN
    IF r.outreach_sent_at IS NULL THEN RAISE EXCEPTION 'Not marked sent'; END IF;
    IF r.outreach_sent_by IS DISTINCT FROM me AND NOT approver THEN RAISE EXCEPTION 'Only the sender can undo'; END IF;
    IF coalesce(r.contact_method,'') NOT LIKE 'TikTok DM (assumed%' THEN RAISE EXCEPTION 'Contact was confirmed elsewhere; not undoing'; END IF;
    UPDATE public.creators SET
      contacted_date = r.outreach_prev->>'contacted_date', contact_method = r.outreach_prev->>'contact_method',
      response_followup = r.outreach_prev->>'response_followup', outreach_sent_by = NULL, outreach_sent_at = NULL, outreach_prev = NULL
    WHERE id = p_id;
  ELSE RAISE EXCEPTION 'Unknown action';
  END IF;
  RETURN jsonb_build_object('ok', true, 'me', me);
END $$;
REVOKE ALL ON FUNCTION public.outreach_action(text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.outreach_action(text,text,text) TO authenticated;