-- Saved creator-specific outreach prepared in batches outside the CRM.
-- Null means the creator still needs personalization.
alter table public.creators
  add column if not exists personalized_dm text,
  add column if not exists personalized_email_subject text,
  add column if not exists personalized_email_body text,
  add column if not exists personalization_source text;
