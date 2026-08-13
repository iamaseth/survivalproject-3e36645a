-- Add Thu's Google account to the permanent Survival Tabs team roster.
insert into public.team_role_assignments (email, role, display_name)
values ('2phabulous@gmail.com', 'research_manager', 'Thu')
on conflict (email) do update set
  role = excluded.role,
  display_name = excluded.display_name;

-- Repair the existing authenticated account immediately if it already exists.
insert into public.user_roles (user_id, role)
select id, 'research_manager'::public.app_role
from auth.users
where lower(email) = '2phabulous@gmail.com'
on conflict (user_id, role) do nothing;

update public.profiles p
set email = '2phabulous@gmail.com',
    updated_at = now()
from auth.users u
where p.id = u.id
  and lower(u.email) = '2phabulous@gmail.com';
