-- Correct permanent team role mapping for Perry's 2phabulous account.
-- This changes only the role row for this one authenticated email.
update public.user_roles ur
set role = 'executive'
from auth.users au
where ur.user_id = au.id
  and lower(au.email) = '2phabulous@gmail.com';
