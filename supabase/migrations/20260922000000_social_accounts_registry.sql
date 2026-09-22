-- Public profile metadata only; never store social passwords, MFA codes or OAuth tokens.
create table if not exists public.social_accounts (
 platform text primary key check (platform in ('tiktok','facebook','instagram','youtube','x')),
 profile_url text not null default '',
 account_handle text not null default '',
 account_owner text not null default '',
 purpose text not null default '',
 connection_status text not null default 'not_connected' check (connection_status in ('not_connected','waiting_for_owner','connection_unavailable')),
 notes text not null default '',
 updated_by uuid references auth.users(id),
 updated_at timestamptz not null default now()
);
alter table public.social_accounts enable row level security;
create policy "Team reads social account registry" on public.social_accounts for select to authenticated
 using (exists (select 1 from public.user_roles r where r.user_id = (select auth.uid())));
create policy "Team inserts social account registry" on public.social_accounts for insert to authenticated
 with check (exists (select 1 from public.user_roles r where r.user_id = (select auth.uid())));
create policy "Team updates social account registry" on public.social_accounts for update to authenticated
 using (exists (select 1 from public.user_roles r where r.user_id = (select auth.uid())))
 with check (exists (select 1 from public.user_roles r where r.user_id = (select auth.uid())));
