create table if not exists public.team_messages (
  id uuid primary key default gen_random_uuid(),
  thread_owner_id uuid not null references auth.users(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  sender_name text not null,
  sender_email text not null,
  message_type text not null default 'Question',
  body text not null,
  page_url text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists team_messages_thread_created_idx
  on public.team_messages (thread_owner_id, created_at);

alter table public.team_messages enable row level security;

-- Rena/team members can only see their own conversation with Seth.
-- Seth can see every team conversation so he can answer from his computer.
create policy "team chat select"
on public.team_messages
for select
to authenticated
using (
  thread_owner_id = auth.uid()
  or lower(coalesce(auth.jwt() ->> 'email', '')) = 'thenxyz@gmail.com'
);

create policy "team chat insert own or seth reply"
on public.team_messages
for insert
to authenticated
with check (
  sender_id = auth.uid()
  and (
    thread_owner_id = auth.uid()
    or lower(coalesce(auth.jwt() ->> 'email', '')) = 'thenxyz@gmail.com'
  )
);

create policy "team chat mark read"
on public.team_messages
for update
to authenticated
using (
  (thread_owner_id = auth.uid() and sender_id <> auth.uid())
  or (
    lower(coalesce(auth.jwt() ->> 'email', '')) = 'thenxyz@gmail.com'
    and sender_id <> auth.uid()
  )
)
with check (
  (thread_owner_id = auth.uid() and sender_id <> auth.uid())
  or (
    lower(coalesce(auth.jwt() ->> 'email', '')) = 'thenxyz@gmail.com'
    and sender_id <> auth.uid()
  )
);
