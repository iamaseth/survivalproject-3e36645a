alter table public.youtube_candidates
  add column if not exists email_source text,
  add column if not exists enrichment_status text not null default 'not_started',
  add column if not exists enrichment_checked_at timestamptz,
  add column if not exists enrichment_error text,
  add column if not exists external_links jsonb not null default '[]'::jsonb;

create index if not exists youtube_candidates_enrichment_queue_idx
  on public.youtube_candidates (enrichment_status, status, email_status, created_at desc);
