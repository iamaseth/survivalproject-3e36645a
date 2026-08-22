-- Security hardening after Lovable security scan findings.
-- Additive/restrictive only: no production data rows are deleted or replaced.
-- Backup branch before this change: backup/pre-security-hardening-2026-08-22

-- Remove all anonymous table privileges from CRM/private operational data.
revoke all privileges on table public.admin_audit_log from anon;
revoke all privileges on table public.amazon_discovery_candidates from anon;
revoke all privileges on table public.app_user_connections from anon;
revoke all privileges on table public.creator_workspace from anon;
revoke all privileges on table public.creators from anon;
revoke all privileges on table public.creators_archive from anon;
revoke all privileges on table public.email_templates from anon;
revoke all privileges on table public.gmail_messages from anon;
revoke all privileges on table public.gmail_poll_state from anon;
revoke all privileges on table public.gmail_send_errors from anon;
revoke all privileges on table public.ingest_tokens from anon;
revoke all privileges on table public.profiles from anon;
revoke all privileges on table public.reviewed_creators from anon;
revoke all privileges on table public.sales_prospects from anon;
revoke all privileges on table public.team_role_assignments from anon;
revoke all privileges on table public.user_roles from anon;
revoke all privileges on table public.youtube_candidates from anon;

-- Amazon discovery must be scoped to actual team members, not every
-- authenticated Supabase account.
drop policy if exists "Authenticated team can read amazon discovery" on public.amazon_discovery_candidates;
drop policy if exists "Authenticated team can insert amazon discovery" on public.amazon_discovery_candidates;
drop policy if exists "Authenticated team can update amazon discovery" on public.amazon_discovery_candidates;

create policy "Team can read amazon discovery"
on public.amazon_discovery_candidates for select to authenticated
using (exists (select 1 from public.user_roles ur where ur.user_id = auth.uid()));

create policy "Team can insert amazon discovery"
on public.amazon_discovery_candidates for insert to authenticated
with check (exists (select 1 from public.user_roles ur where ur.user_id = auth.uid()));

create policy "Team can update amazon discovery"
on public.amazon_discovery_candidates for update to authenticated
using (exists (select 1 from public.user_roles ur where ur.user_id = auth.uid()))
with check (exists (select 1 from public.user_roles ur where ur.user_id = auth.uid()));

-- Discovery rows are append/update only from the client.
revoke delete, truncate on table public.amazon_discovery_candidates from authenticated;

-- sales_prospects already had RLS enabled but no visible SELECT policy.
drop policy if exists "Team can view sales prospects" on public.sales_prospects;
create policy "Team can view sales prospects"
on public.sales_prospects for select to authenticated
using (exists (select 1 from public.user_roles ur where ur.user_id = auth.uid()));

-- Core research datasets follow the AI OS append-by-default rule.
revoke delete, truncate on table public.creators from authenticated;
revoke delete, truncate on table public.creators_archive from authenticated;
revoke delete, truncate on table public.reviewed_creators from authenticated;
revoke delete, truncate on table public.sales_prospects from authenticated;
revoke delete, truncate on table public.youtube_candidates from authenticated;
