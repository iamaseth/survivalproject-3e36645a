create or replace function public.get_rena_chat_user_id()
returns uuid
language sql
stable
security definer
set search_path = public, auth
as $$
  select case
    when lower(coalesce(auth.jwt() ->> 'email', '')) = 'thenxyz@gmail.com'
      then (select p.id from public.profiles p where lower(p.email) = 'renas1503@gmail.com' limit 1)
    else null
  end
$$;

revoke all on function public.get_rena_chat_user_id() from public;
grant execute on function public.get_rena_chat_user_id() to authenticated;
