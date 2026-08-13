-- Permanent Survival Tabs team roster.
-- Keeps the email allow-list in Supabase as the source of truth and repairs
-- roles for team members who authenticated before their email was mapped.

-- Ensure the role enum supports technical/content team access.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'app_role'
      AND e.enumlabel = 'shopify_content_editor'
  ) THEN
    ALTER TYPE public.app_role ADD VALUE 'shopify_content_editor';
  END IF;
END $$;

-- Upsert the authoritative Survival Tabs OS roster.
INSERT INTO public.team_role_assignments (email, role, display_name) VALUES
  ('atp@globenetcapitalgroup.com', 'executive',               'Perry'),
  ('ellezolie@atp.com',            'executive',               'Perry'),
  ('thenxyz@gmail.com',             'research_manager',        'Seth'),
  ('renas1503@gmail.com',           'partnership_manager',     'Rena'),
  ('vinapanda777@gmail.com',        'partnership_coordinator', 'Vina'),
  ('alvisslohasfarms@gmail.com',    'shopify_content_editor',  'Tuan (Alvis)'),
  ('hoanglohasfarms@gmail.com',     'shopify_content_editor',  'Hoang')
ON CONFLICT (email) DO UPDATE SET
  role = EXCLUDED.role,
  display_name = EXCLUDED.display_name;

-- Backfill/repair profiles + roles for users who already signed in before
-- their permanent email assignment existed.
INSERT INTO public.profiles (id, email, full_name, avatar_url)
SELECT
  u.id,
  lower(coalesce(u.email, u.raw_user_meta_data->>'email')),
  coalesce(
    a.display_name,
    u.raw_user_meta_data->>'full_name',
    u.raw_user_meta_data->>'name'
  ),
  coalesce(u.raw_user_meta_data->>'avatar_url', u.raw_user_meta_data->>'picture')
FROM auth.users u
JOIN public.team_role_assignments a
  ON a.email = lower(coalesce(u.email, u.raw_user_meta_data->>'email'))
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
  avatar_url = COALESCE(EXCLUDED.avatar_url, public.profiles.avatar_url),
  updated_at = now();

-- One permanent app role per team user. If a previous role exists, replace it
-- with the role from the authoritative email roster.
DELETE FROM public.user_roles ur
USING auth.users u, public.team_role_assignments a
WHERE ur.user_id = u.id
  AND a.email = lower(coalesce(u.email, u.raw_user_meta_data->>'email'))
  AND ur.role IS DISTINCT FROM a.role;

INSERT INTO public.user_roles (user_id, role)
SELECT u.id, a.role
FROM auth.users u
JOIN public.team_role_assignments a
  ON a.email = lower(coalesce(u.email, u.raw_user_meta_data->>'email'))
ON CONFLICT (user_id, role) DO NOTHING;

-- Make sign-in self-healing: every new auth user is matched against the
-- permanent email roster, and the correct role is restored automatically.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _email       text := lower(coalesce(NEW.email, NEW.raw_user_meta_data->>'email'));
  _full_name   text := coalesce(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name');
  _avatar      text := coalesce(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture');
  _assigned    public.app_role;
  _display     text;
BEGIN
  SELECT role, display_name
    INTO _assigned, _display
  FROM public.team_role_assignments
  WHERE email = _email;

  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (NEW.id, _email, coalesce(_display, _full_name), _avatar)
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
    avatar_url = COALESCE(EXCLUDED.avatar_url, public.profiles.avatar_url),
    updated_at = now();

  IF _assigned IS NOT NULL THEN
    DELETE FROM public.user_roles
    WHERE user_id = NEW.id
      AND role IS DISTINCT FROM _assigned;

    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, _assigned)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- Also repair the role whenever Supabase updates an existing auth user.
CREATE OR REPLACE FUNCTION public.sync_team_role_from_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _email       text := lower(coalesce(NEW.email, NEW.raw_user_meta_data->>'email'));
  _assigned    public.app_role;
  _display     text;
BEGIN
  SELECT role, display_name
    INTO _assigned, _display
  FROM public.team_role_assignments
  WHERE email = _email;

  IF _assigned IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    _email,
    coalesce(_display, NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    coalesce(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture')
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
    avatar_url = COALESCE(EXCLUDED.avatar_url, public.profiles.avatar_url),
    updated_at = now();

  DELETE FROM public.user_roles
  WHERE user_id = NEW.id
    AND role IS DISTINCT FROM _assigned;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, _assigned)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_team_sync ON auth.users;
CREATE TRIGGER on_auth_user_team_sync
  AFTER UPDATE OF email, raw_user_meta_data ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.sync_team_role_from_email();

REVOKE ALL ON FUNCTION public.sync_team_role_from_email() FROM PUBLIC, anon, authenticated;
