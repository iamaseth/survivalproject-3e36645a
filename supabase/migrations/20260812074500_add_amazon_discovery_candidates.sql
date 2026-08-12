-- Review-first queue for automated Amazon creator discovery.
create table if not exists public.amazon_discovery_candidates (
  id uuid primary key default gen_random_uuid(),
  seed_url text not null,
  candidate_url text not null,
  candidate_type text not null default 'related_content',
  creator_name text,
  source_label text not null default 'Amazon Explore related content',
  status text not null default 'new',
  notes text,
  discovered_at timestamptz not null default now(),
  reviewed_at timestamptz,
  promoted_creator_id text,
  discovered_by uuid,
  constraint amazon_discovery_candidates_status_check check (status in ('new','review','promoted','skipped')),
  constraint amazon_discovery_candidates_seed_candidate_unique unique (seed_url, candidate_url)
);

alter table public.amazon_discovery_candidates enable row level security;

-- Match the existing CRM model: authenticated team members can use the internal discovery queue.
drop policy if exists "Authenticated team can read amazon discovery" on public.amazon_discovery_candidates;
create policy "Authenticated team can read amazon discovery"
  on public.amazon_discovery_candidates for select
  to authenticated using (true);

drop policy if exists "Authenticated team can insert amazon discovery" on public.amazon_discovery_candidates;
create policy "Authenticated team can insert amazon discovery"
  on public.amazon_discovery_candidates for insert
  to authenticated with check (true);

drop policy if exists "Authenticated team can update amazon discovery" on public.amazon_discovery_candidates;
create policy "Authenticated team can update amazon discovery"
  on public.amazon_discovery_candidates for update
  to authenticated using (true) with check (true);

create index if not exists amazon_discovery_candidates_status_idx
  on public.amazon_discovery_candidates(status, discovered_at desc);

comment on table public.amazon_discovery_candidates is 'Review-first candidate queue discovered from Amazon seed videos/storefronts before promotion into the creator CRM.';