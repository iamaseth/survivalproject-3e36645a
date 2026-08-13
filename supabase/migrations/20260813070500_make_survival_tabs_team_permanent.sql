-- Permanent Survival Tabs team access.
-- The email roster is the source of truth. Existing users are repaired now,
-- every authenticated team member can repair their own role on each app load,
-- and RLS recognizes roster members even if user_roles is temporarily stale.

INSERT INTO public.team_role_assignments (email, role, display_name) VALUES
  ('atp@globenetcapitalgroup.com', 'executive',               'Perry'),
  ('ellezolie@gmail.com',          'executive',               'Perry'),
  ('thenxyz@gmail.com',            'research_manager',        'Seth'),
  ('renas1503@gmail.com',          'partnership_manager',     'Rena'),
  ('vinapanda777@gmail.com',       'partnership_coordinator', 'Vina'),
  ('alvisslohasfarms@gmail.com',   'shopify_content_editor',  'Tuan (Alvis)'),
  ('hoanglohasfarms@gmail.com',    'shopify_content_editor',  'Hoang')
ON CONFLICT (email) DO UPDATE SET
  role = EXCLUDED.role,
  display_name = EXCLUDED.display_name;

-- Remove obsolete placeholder addresses so there is only one canonical roster.
DELETE FROM public.team_role_assignments
WHERE lower(email) IN (
  'perry@survivaltabs.com',
  'seth@survivaltabs.com',
  'rena@survivaltabs.com',
  'vina@survivaltabs.com'
);

-- RLS must not depend solely on user_roles. A person on the permanent email
-- roster is a team member even if their user_roles row was lost or predates
-- the roster correction.
CREATE OR REPLACE FUNCTION private.is_team_member(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = _user_id
  ) OR EXISTS (
    SELECT 1
    FROM auth.users u
    JOIN public.team_role_assignments a
      ON lower(a.email) = lower(coalesce(u.email, u.raw_user_meta_data->>'email'))
    WHERE u.id = _user_id
  )
$$;

REVOKE ALL ON FUNCTION private.is_team_member(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.is_team_member(uuid) TO authenticated, service_role;

-- Role checks also fall back to the authoritative email roster. This prevents
-- executive/manager functionality from failing when a stale user_roles row is
-- the only problem.
CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = _user_id AND ur.role = _role
  ) OR EXISTS (
    SELECT 1
    FROM auth.users u
    JOIN public.team_role_assignments a
      ON lower(a.email) = lower(coalesce(u.email, u.raw_user_meta_data->>'email'))
    WHERE u.id = _user_id AND a.role = _role
  )
$$;

REVOKE ALL ON FUNCTION private.has_role(uuid, public.app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated, service_role;

-- Backfill all existing auth users who are already on the permanent roster.
INSERT INTO public.profiles (id, email, full_name, avatar_url)
SELECT
  u.id,
  lower(coalesce(u.email, u.raw_user_meta_data->>'email')),
  coalesce(a.display_name, u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name'),
  coalesce(u.raw_user_meta_data->>'avatar_url', u.raw_user_meta_data->>'picture')
FROM auth.users u
JOIN public.team_role_assignments a
  ON lower(a.email) = lower(coalesce(u.email, u.raw_user_meta_data->>'email'))
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
  avatar_url = COALESCE(EXCLUDED.avatar_url, public.profiles.avatar_url),
  updated_at = now();

DELETE FROM public.user_roles ur
USING auth.users u, public.team_role_assignments a
WHERE ur.user_id = u.id
  AND lower(a.email) = lower(coalesce(u.email, u.raw_user_meta_data->>'email'))
  AND ur.role IS DISTINCT FROM a.role;

INSERT INTO public.user_roles (user_id, role)
SELECT u.id, a.role
FROM auth.users u
JOIN public.team_role_assignments a
  ON lower(a.email) = lower(coalesce(u.email, u.raw_user_meta_data->>'email'))
ON CONFLICT (user_id, role) DO NOTHING;

-- Explicit repair RPC. The app calls this on EVERY authenticated load. This is
-- the key permanent fix for users who existed before their email was mapped.
CREATE OR REPLACE FUNCTION public.ensure_current_team_access()
RETURNS public.app_role
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid      uuid := auth.uid();
  _email    text := lower(coalesce(auth.jwt()->>'email', ''));
  _role     public.app_role;
  _display  text;
BEGIN
  IF _uid IS NULL OR _email = '' THEN
    RETURN NULL;
  END IF;

  SELECT role, display_name
    INTO _role, _display
  FROM public.team_role_assignments
  WHERE lower(email) = _email;

  IF _role IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.profiles (id, email, full_name)
  VALUES (_uid, _email, _display)
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
    updated_at = now();

  DELETE FROM public.user_roles
  WHERE user_id = _uid AND role IS DISTINCT FROM _role;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (_uid, _role)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN _role;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_current_team_access() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_current_team_access() TO authenticated;

-- New users are still assigned immediately at account creation.
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
  SELECT role, display_name INTO _assigned, _display
  FROM public.team_role_assignments
  WHERE lower(email) = _email;

  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (NEW.id, _email, coalesce(_display, _full_name), _avatar)
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
    avatar_url = COALESCE(EXCLUDED.avatar_url, public.profiles.avatar_url),
    updated_at = now();

  IF _assigned IS NOT NULL THEN
    DELETE FROM public.user_roles
    WHERE user_id = NEW.id AND role IS DISTINCT FROM _assigned;

    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, _assigned)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- Existing users are also repaired whenever Supabase updates their auth row.
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
  SELECT role, display_name INTO _assigned, _display
  FROM public.team_role_assignments
  WHERE lower(email) = _email;

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
  WHERE user_id = NEW.id AND role IS DISTINCT FROM _assigned;

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
