-- Additive only: outreach campaigns, queue items, reply classifications.

CREATE TABLE public.outreach_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  goal text,
  product_context text,
  sample_policy text,
  allowed_offer_notes text,
  forbidden_promises text,
  brand_tone text,
  default_template_id uuid REFERENCES public.email_templates(id) ON DELETE SET NULL,
  daily_send_cap integer NOT NULL DEFAULT 25,
  status text NOT NULL DEFAULT 'draft',
  sending_locked boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT outreach_campaigns_status_chk CHECK (status IN ('draft','active','paused','completed','cancelled')),
  CONSTRAINT outreach_campaigns_cap_chk CHECK (daily_send_cap > 0)
);

GRANT SELECT, INSERT, UPDATE ON public.outreach_campaigns TO authenticated;
GRANT ALL ON public.outreach_campaigns TO service_role;
ALTER TABLE public.outreach_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team can view outreach campaigns" ON public.outreach_campaigns
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()));
CREATE POLICY "Team can insert outreach campaigns" ON public.outreach_campaigns
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()));
CREATE POLICY "Team can update outreach campaigns" ON public.outreach_campaigns
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()));

CREATE TRIGGER outreach_campaigns_set_updated_at
  BEFORE UPDATE ON public.outreach_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.outreach_queue_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.outreach_campaigns(id) ON DELETE CASCADE,
  creator_id text NOT NULL,
  sequence_step smallint NOT NULL DEFAULT 1,
  idempotency_key text NOT NULL,
  template_id uuid REFERENCES public.email_templates(id) ON DELETE SET NULL,
  template_version text,
  recipient_email text,
  subject_snapshot text,
  body_snapshot text,
  image_url text,
  image_alt text,
  not_before timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending',
  gmail_message_id text,
  gmail_thread_id text,
  attempt_count integer NOT NULL DEFAULT 0,
  error_reason text,
  sent_at timestamptz,
  cancelled_reason text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT outreach_queue_status_chk CHECK (status IN ('pending','approved','sending','sent','failed','skipped','cancelled')),
  CONSTRAINT outreach_queue_step_chk CHECK (sequence_step BETWEEN 1 AND 10)
);

CREATE UNIQUE INDEX outreach_queue_idempotency_uidx ON public.outreach_queue_items (idempotency_key);
CREATE UNIQUE INDEX outreach_queue_campaign_creator_step_uidx
  ON public.outreach_queue_items (campaign_id, creator_id, sequence_step);
CREATE INDEX outreach_queue_status_idx ON public.outreach_queue_items (status, not_before);
CREATE INDEX outreach_queue_creator_idx ON public.outreach_queue_items (creator_id);

GRANT SELECT, INSERT, UPDATE ON public.outreach_queue_items TO authenticated;
GRANT ALL ON public.outreach_queue_items TO service_role;
ALTER TABLE public.outreach_queue_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team can view outreach queue" ON public.outreach_queue_items
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()));
CREATE POLICY "Team can insert outreach queue" ON public.outreach_queue_items
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()));
CREATE POLICY "Team can update outreach queue" ON public.outreach_queue_items
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()));

CREATE TRIGGER outreach_queue_items_set_updated_at
  BEFORE UPDATE ON public.outreach_queue_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Sent items can never be resent or rewritten by retry logic.
CREATE OR REPLACE FUNCTION public.outreach_queue_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.status = 'sent' AND NEW.status IS DISTINCT FROM 'sent' THEN
    RAISE EXCEPTION 'Sent outreach queue items are immutable and cannot be re-queued';
  END IF;
  IF OLD.status = 'sent' THEN
    NEW.gmail_message_id := OLD.gmail_message_id;
    NEW.gmail_thread_id := OLD.gmail_thread_id;
    NEW.sent_at := OLD.sent_at;
    NEW.subject_snapshot := OLD.subject_snapshot;
    NEW.body_snapshot := OLD.body_snapshot;
  END IF;
  IF OLD.status = 'cancelled' AND NEW.status IN ('approved','sending','sent') THEN
    RAISE EXCEPTION 'Cancelled outreach queue items cannot be reactivated';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER outreach_queue_items_guard
  BEFORE UPDATE ON public.outreach_queue_items
  FOR EACH ROW EXECUTE FUNCTION public.outreach_queue_guard();

CREATE TABLE public.creator_reply_classifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gmail_message_id text NOT NULL UNIQUE,
  creator_id text,
  category text NOT NULL,
  confidence numeric NOT NULL DEFAULT 0,
  risk_flags jsonb NOT NULL DEFAULT '[]'::jsonb,
  next_action text,
  requires_human_review boolean NOT NULL DEFAULT true,
  reviewed_by uuid,
  reviewed_at timestamptz,
  classifier_version text NOT NULL DEFAULT 'deterministic-v1',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT creator_reply_category_chk CHECK (category IN ('interested','ask_price','ask_sample','rejected','posted','needs_human','invalid'))
);

CREATE INDEX creator_reply_classifications_creator_idx ON public.creator_reply_classifications (creator_id);
CREATE INDEX creator_reply_classifications_category_idx ON public.creator_reply_classifications (category);

GRANT SELECT, INSERT, UPDATE ON public.creator_reply_classifications TO authenticated;
GRANT ALL ON public.creator_reply_classifications TO service_role;
ALTER TABLE public.creator_reply_classifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team can view reply classifications" ON public.creator_reply_classifications
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()));
CREATE POLICY "Team can insert reply classifications" ON public.creator_reply_classifications
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()));
CREATE POLICY "Team can update reply classifications" ON public.creator_reply_classifications
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()));

CREATE TRIGGER creator_reply_classifications_set_updated_at
  BEFORE UPDATE ON public.creator_reply_classifications
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();