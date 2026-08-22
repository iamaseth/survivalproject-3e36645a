-- Add reusable inline image support to email templates.
-- Additive only: preserves all existing rows and does not create delete policies.

alter table public.email_templates
  add column if not exists image_url text,
  add column if not exists image_alt text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'template-images',
  'template-images',
  true,
  5242880,
  array['image/png','image/jpeg','image/webp','image/gif']::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname='storage' and tablename='objects'
      and policyname='Team can upload template images'
  ) then
    create policy "Team can upload template images"
      on storage.objects for insert to authenticated
      with check (
        bucket_id = 'template-images'
        and exists (select 1 from public.user_roles ur where ur.user_id = auth.uid())
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='storage' and tablename='objects'
      and policyname='Team can update template images'
  ) then
    create policy "Team can update template images"
      on storage.objects for update to authenticated
      using (
        bucket_id = 'template-images'
        and exists (select 1 from public.user_roles ur where ur.user_id = auth.uid())
      )
      with check (
        bucket_id = 'template-images'
        and exists (select 1 from public.user_roles ur where ur.user_id = auth.uid())
      );
  end if;
end $$;

create or replace function public.email_templates_unapprove_on_edit()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if (new.name is distinct from old.name)
     or (new.segment is distinct from old.segment)
     or (new.subject is distinct from old.subject)
     or (new.body is distinct from old.body)
     or (new.image_url is distinct from old.image_url)
     or (new.image_alt is distinct from old.image_alt) then
    new.approved_by := null;
    new.approved_at := null;
    new.active := false;
  end if;
  return new;
end;
$function$;
