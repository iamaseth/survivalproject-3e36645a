alter table public.creators
  add column if not exists qualification_status text;

alter table public.creators
  drop constraint if exists creators_qualification_status_check;

alter table public.creators
  add constraint creators_qualification_status_check
  check (qualification_status is null or qualification_status in ('Qualified', 'Needs Review', 'Not Relevant'));

create index if not exists creators_qualification_status_idx
  on public.creators (qualification_status);