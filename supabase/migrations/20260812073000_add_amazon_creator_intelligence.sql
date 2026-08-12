-- Amazon Creator + Video Intelligence for Survival Tabs creator CRM.
-- Nullable fields keep existing creator records fully backward compatible.
alter table public.creators
  add column if not exists amazon_storefront_url text,
  add column if not exists amazon_video_url text,
  add column if not exists amazon_discovery_source text,
  add column if not exists amazon_reviewed_survival_tabs boolean,
  add column if not exists amazon_shoppable_video boolean,
  add column if not exists amazon_fit_score smallint,
  add column if not exists amazon_content_analysis text;

alter table public.creators
  drop constraint if exists creators_amazon_fit_score_check;

alter table public.creators
  add constraint creators_amazon_fit_score_check
  check (amazon_fit_score is null or amazon_fit_score between 0 and 100);

comment on column public.creators.amazon_storefront_url is 'Amazon creator storefront/profile URL';
comment on column public.creators.amazon_video_url is 'Amazon Live or shoppable video URL used for discovery/review';
comment on column public.creators.amazon_discovery_source is 'How this creator was discovered, e.g. Explore related content';
comment on column public.creators.amazon_reviewed_survival_tabs is 'Creator has published content specifically reviewing Survival Tabs';
comment on column public.creators.amazon_shoppable_video is 'Creator publishes Amazon shoppable video / Amazon Live content';
comment on column public.creators.amazon_fit_score is 'Internal Survival Tabs partnership fit score from 0 to 100';
comment on column public.creators.amazon_content_analysis is 'Notes on hooks, format, claims, audience, CTA and repeatable video ideas';