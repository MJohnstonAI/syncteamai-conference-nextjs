-- Prevent Auth signup failures caused by stale/onboarding triggers and
-- standardize post-login profile provisioning used by the frontend.

-- 1) Make sure the role enum includes `pending` for default onboarding.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'app_role'
  ) THEN
    BEGIN
      ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'pending';
    EXCEPTION
      WHEN duplicate_object THEN
        NULL;
    END;
  END IF;
END
$$;

-- 2) Profiles may store a useful email hint.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email TEXT;

-- 3) Ensure the app RPC exists in the expected signature and works whether
-- profile/role foreign key columns are TEXT or UUID in older projects.
DROP FUNCTION IF EXISTS public.ensure_profile_and_role(TEXT);
DROP FUNCTION IF EXISTS public.ensure_profile_and_role(UUID);

CREATE OR REPLACE FUNCTION public.ensure_profile_and_role(
  _user_id TEXT,
  _email TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  profiles_id_type TEXT;
  user_roles_user_id_type TEXT;
BEGIN
  IF COALESCE(_user_id, '') = '' THEN
    RAISE EXCEPTION 'user id required';
  END IF;

  IF _user_id <> auth.uid()::text THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  SELECT format_type(a.atttypid, a.atttypmod)
    INTO profiles_id_type
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'profiles'
    AND a.attname = 'id'
    AND a.attnum > 0
    AND NOT a.attisdropped
  LIMIT 1;

  IF profiles_id_type IS NULL THEN
    RAISE EXCEPTION 'Missing public.profiles.id column';
  END IF;

  EXECUTE format(
    'INSERT INTO public.profiles (id, email)
     VALUES (($1)::%1$s, $2)
     ON CONFLICT (id) DO UPDATE
       SET email = COALESCE(EXCLUDED.email, public.profiles.email)',
    profiles_id_type
  )
  USING _user_id, _email;

  IF to_regclass('public.user_roles') IS NOT NULL THEN
    SELECT format_type(a.atttypid, a.atttypmod)
      INTO user_roles_user_id_type
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'user_roles'
      AND a.attname = 'user_id'
      AND a.attnum > 0
      AND NOT a.attisdropped
    LIMIT 1;

    IF user_roles_user_id_type IS NULL THEN
      RAISE EXCEPTION 'Missing public.user_roles.user_id column';
    END IF;

    EXECUTE format(
      'INSERT INTO public.user_roles (user_id, role)
       VALUES (($1)::%1$s, $2::public.app_role)
       ON CONFLICT DO NOTHING',
      user_roles_user_id_type
    )
    USING _user_id, 'pending';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_profile_and_role(TEXT, TEXT) TO authenticated;

-- 4) Supabase Auth magic-link creation can fail with "database error saving new user"
-- if a stale trigger exists. Provisioning is handled after login via RPC, so keep
-- signup path trigger-free.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();
