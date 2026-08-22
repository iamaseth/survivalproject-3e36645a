-- Tighten authenticated privileges around team-role provisioning.
-- Additive/security-only change: no production data is deleted or rewritten.

begin;

revoke all on table public.user_roles from authenticated;
grant select on table public.user_roles to authenticated;

revoke all on table public.team_role_assignments from authenticated;
grant select on table public.team_role_assignments to authenticated;

revoke all on table public.profiles from authenticated;
grant select, update on table public.profiles to authenticated;

-- Approved roles are already provisioned by the auth trigger handle_new_user().
-- Do not expose a SECURITY DEFINER role-provisioning RPC to arbitrary signed-in users.
revoke execute on function public.ensure_current_team_access() from authenticated;

commit;
