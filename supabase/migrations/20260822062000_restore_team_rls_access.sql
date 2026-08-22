-- Restore authenticated team visibility/write access after RLS policies were missing.
-- Non-destructive: no data deletion, truncation, overwrite, or table replacement.
-- Deliberately does NOT add DELETE policies.

create policy "Team can view creators"
on public.creators for select to authenticated
using (exists (select 1 from public.user_roles ur where ur.user_id = auth.uid()));

create policy "Team can insert creators"
on public.creators for insert to authenticated
with check (exists (select 1 from public.user_roles ur where ur.user_id = auth.uid()));

create policy "Team can update creators"
on public.creators for update to authenticated
using (exists (select 1 from public.user_roles ur where ur.user_id = auth.uid()))
with check (exists (select 1 from public.user_roles ur where ur.user_id = auth.uid()));

create policy "Team can view reviewed creators"
on public.reviewed_creators for select to authenticated
using (exists (select 1 from public.user_roles ur where ur.user_id = auth.uid()));

create policy "Team can insert reviewed creators"
on public.reviewed_creators for insert to authenticated
with check (exists (select 1 from public.user_roles ur where ur.user_id = auth.uid()));

create policy "Team can update reviewed creators"
on public.reviewed_creators for update to authenticated
using (exists (select 1 from public.user_roles ur where ur.user_id = auth.uid()))
with check (exists (select 1 from public.user_roles ur where ur.user_id = auth.uid()));

create policy "Team can view creator workspace"
on public.creator_workspace for select to authenticated
using (exists (select 1 from public.user_roles ur where ur.user_id = auth.uid()));

create policy "Team can insert creator workspace"
on public.creator_workspace for insert to authenticated
with check (exists (select 1 from public.user_roles ur where ur.user_id = auth.uid()));

create policy "Team can update creator workspace"
on public.creator_workspace for update to authenticated
using (exists (select 1 from public.user_roles ur where ur.user_id = auth.uid()))
with check (exists (select 1 from public.user_roles ur where ur.user_id = auth.uid()));

create policy "Team can view email templates"
on public.email_templates for select to authenticated
using (exists (select 1 from public.user_roles ur where ur.user_id = auth.uid()));

create policy "Team can insert email templates"
on public.email_templates for insert to authenticated
with check (
  created_by = auth.uid()
  and exists (select 1 from public.user_roles ur where ur.user_id = auth.uid())
);

create policy "Team can update email templates"
on public.email_templates for update to authenticated
using (exists (select 1 from public.user_roles ur where ur.user_id = auth.uid()))
with check (exists (select 1 from public.user_roles ur where ur.user_id = auth.uid()));

create policy "Team can view role assignments"
on public.team_role_assignments for select to authenticated
using (exists (select 1 from public.user_roles ur where ur.user_id = auth.uid()));
