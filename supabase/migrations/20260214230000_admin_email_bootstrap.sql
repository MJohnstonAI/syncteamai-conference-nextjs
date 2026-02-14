-- Hardcoded admin gate for magic-link auth.
-- Only these two emails can ever be admin:
-- 1) marcaj777@gmail.com
-- 2) syncteamai@gmail.com

-- Enforce one role row per user and one entitlement row per user.
-- If conflicting duplicate rows exist, collapse to a single pending row
-- before adding unique constraints.
DO $$
BEGIN
  IF to_regclass('public.user_roles') IS NOT NULL THEN
    CREATE TEMP TABLE _user_roles_conflicts ON COMMIT DROP AS
    SELECT
      user_id::text AS user_id_text,
      COUNT(DISTINCT role::text) AS role_variant_count
    FROM public.user_roles
    GROUP BY user_id::text;

    WITH ranked AS (
      SELECT
        ctid,
        row_number() OVER (
          PARTITION BY user_id::text
          ORDER BY ctid DESC
        ) AS rn
      FROM public.user_roles
    )
    DELETE FROM public.user_roles ur
    USING ranked r
    WHERE ur.ctid = r.ctid
      AND r.rn > 1;

    UPDATE public.user_roles ur
    SET role = 'pending'::public.app_role
    FROM _user_roles_conflicts c
    WHERE ur.user_id::text = c.user_id_text
      AND c.role_variant_count > 1
      AND ur.role IS DISTINCT FROM 'pending'::public.app_role;

    ALTER TABLE public.user_roles
      ALTER COLUMN user_id SET NOT NULL;

    BEGIN
      ALTER TABLE public.user_roles
        ADD CONSTRAINT user_roles_single_role_unique UNIQUE (user_id);
    EXCEPTION
      WHEN duplicate_object THEN
        NULL;
    END;
  END IF;

  IF to_regclass('public.dev_entitlements') IS NOT NULL THEN
    CREATE TEMP TABLE _dev_entitlements_conflicts ON COMMIT DROP AS
    SELECT
      user_id::text AS user_id_text,
      COUNT(DISTINCT tier::text) AS tier_variant_count
    FROM public.dev_entitlements
    GROUP BY user_id::text;

    WITH ranked AS (
      SELECT
        ctid,
        row_number() OVER (
          PARTITION BY user_id::text
          ORDER BY ctid DESC
        ) AS rn
      FROM public.dev_entitlements
    )
    DELETE FROM public.dev_entitlements de
    USING ranked r
    WHERE de.ctid = r.ctid
      AND r.rn > 1;

    UPDATE public.dev_entitlements de
    SET tier = 'pending',
        expires_at = NULL
    FROM _dev_entitlements_conflicts c
    WHERE de.user_id::text = c.user_id_text
      AND c.tier_variant_count > 1
      AND de.tier IS DISTINCT FROM 'pending';

    ALTER TABLE public.dev_entitlements
      ALTER COLUMN user_id SET NOT NULL;

    BEGIN
      ALTER TABLE public.dev_entitlements
        ADD CONSTRAINT dev_entitlements_single_tier_unique UNIQUE (user_id);
    EXCEPTION
      WHEN duplicate_object THEN
        NULL;
    END;
  END IF;
END
$$;

DROP FUNCTION IF EXISTS public.ensure_profile_and_role(TEXT);
DROP FUNCTION IF EXISTS public.ensure_profile_and_role(UUID);
DROP FUNCTION IF EXISTS public.ensure_profile_and_role(TEXT, TEXT);

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
  entitlements_user_id_type TEXT;
  normalized_email TEXT;
  target_role public.app_role := 'pending'::public.app_role;
BEGIN
  IF COALESCE(_user_id, '') = '' THEN
    RAISE EXCEPTION 'user id required';
  END IF;

  IF _user_id <> auth.uid()::text THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  normalized_email := NULLIF(lower(trim(_email)), '');

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
  USING _user_id, normalized_email;

  IF normalized_email IN ('marcaj777@gmail.com', 'syncteamai@gmail.com') THEN
    target_role := 'admin'::public.app_role;
  END IF;

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

    EXECUTE '
      UPDATE public.user_roles
      SET role = CASE
        WHEN $2::public.app_role = ''admin''::public.app_role THEN ''admin''::public.app_role
        ELSE role
      END
      WHERE user_id::text = $1::text
    '
    USING _user_id, target_role::text;

    EXECUTE format(
      'INSERT INTO public.user_roles (user_id, role)
       SELECT ($1::text)::%1$s, $2::public.app_role
       WHERE NOT EXISTS (
         SELECT 1
         FROM public.user_roles ur
         WHERE ur.user_id::text = $1::text
       )',
      user_roles_user_id_type
    )
    USING _user_id, target_role::text;

    IF normalized_email IS NOT NULL
       AND normalized_email NOT IN ('marcaj777@gmail.com', 'syncteamai@gmail.com') THEN
      EXECUTE '
        UPDATE public.user_roles
        SET role = ''pending''::public.app_role
        WHERE user_id::text = $1::text
          AND role = ''admin''::public.app_role
      '
      USING _user_id;
    END IF;
  END IF;

  IF target_role = 'admin'::public.app_role
     AND to_regclass('public.dev_entitlements') IS NOT NULL THEN
    SELECT format_type(a.atttypid, a.atttypmod)
      INTO entitlements_user_id_type
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'dev_entitlements'
      AND a.attname = 'user_id'
      AND a.attnum > 0
      AND NOT a.attisdropped
    LIMIT 1;

    IF entitlements_user_id_type IS NULL THEN
      RAISE EXCEPTION 'Missing public.dev_entitlements.user_id column';
    END IF;

    EXECUTE '
      UPDATE public.dev_entitlements
      SET tier = $2,
          expires_at = NULL
      WHERE user_id::text = $1::text
    '
    USING _user_id, 'admin';

    EXECUTE format(
      'INSERT INTO public.dev_entitlements (user_id, tier, expires_at)
       SELECT ($1::text)::%1$s, $2, NULL
       WHERE NOT EXISTS (
         SELECT 1
         FROM public.dev_entitlements de
         WHERE de.user_id::text = $1::text
       )',
      entitlements_user_id_type
    )
    USING _user_id, 'admin';
  ELSIF normalized_email IS NOT NULL
     AND normalized_email NOT IN ('marcaj777@gmail.com', 'syncteamai@gmail.com')
     AND to_regclass('public.dev_entitlements') IS NOT NULL THEN
    EXECUTE '
      UPDATE public.dev_entitlements
      SET tier = ''pending'',
          expires_at = NULL
      WHERE user_id::text = $1::text
        AND tier = ''admin''
    '
    USING _user_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_profile_and_role(TEXT, TEXT) TO authenticated;

DO $$
DECLARE
  profiles_id_type TEXT;
  user_roles_user_id_type TEXT;
  entitlements_user_id_type TEXT;
BEGIN
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
     SELECT (u.id::text)::%1$s, lower(u.email)
     FROM auth.users u
     WHERE lower(u.email) IN (''marcaj777@gmail.com'', ''syncteamai@gmail.com'')
     ON CONFLICT (id) DO UPDATE
       SET email = COALESCE(EXCLUDED.email, public.profiles.email)',
    profiles_id_type
  );

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

    EXECUTE '
      UPDATE public.user_roles ur
      SET role = ''admin''::public.app_role
      WHERE EXISTS (
        SELECT 1
        FROM auth.users u
        WHERE u.id::text = ur.user_id::text
          AND lower(u.email) IN (''marcaj777@gmail.com'', ''syncteamai@gmail.com'')
      )
    ';

    EXECUTE format(
      'INSERT INTO public.user_roles (user_id, role)
       SELECT (u.id::text)::%1$s, ''admin''::public.app_role
       FROM auth.users u
       WHERE lower(u.email) IN (''marcaj777@gmail.com'', ''syncteamai@gmail.com'')
         AND NOT EXISTS (
           SELECT 1
           FROM public.user_roles ur
           WHERE ur.user_id::text = u.id::text
         )',
      user_roles_user_id_type
    );

    EXECUTE '
      UPDATE public.user_roles ur
      SET role = ''pending''::public.app_role
      WHERE ur.role = ''admin''::public.app_role
        AND NOT EXISTS (
          SELECT 1
          FROM auth.users u
          WHERE u.id::text = ur.user_id::text
            AND lower(u.email) IN (''marcaj777@gmail.com'', ''syncteamai@gmail.com'')
        )
    ';
  END IF;

  IF to_regclass('public.dev_entitlements') IS NOT NULL THEN
    SELECT format_type(a.atttypid, a.atttypmod)
      INTO entitlements_user_id_type
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'dev_entitlements'
      AND a.attname = 'user_id'
      AND a.attnum > 0
      AND NOT a.attisdropped
    LIMIT 1;

    IF entitlements_user_id_type IS NULL THEN
      RAISE EXCEPTION 'Missing public.dev_entitlements.user_id column';
    END IF;

    EXECUTE '
      UPDATE public.dev_entitlements de
      SET tier = ''admin'',
          expires_at = NULL
      WHERE EXISTS (
        SELECT 1
        FROM auth.users u
        WHERE u.id::text = de.user_id::text
          AND lower(u.email) IN (''marcaj777@gmail.com'', ''syncteamai@gmail.com'')
      )
    ';

    EXECUTE format(
      'INSERT INTO public.dev_entitlements (user_id, tier, expires_at)
       SELECT (u.id::text)::%1$s, ''admin'', NULL
       FROM auth.users u
       WHERE lower(u.email) IN (''marcaj777@gmail.com'', ''syncteamai@gmail.com'')
         AND NOT EXISTS (
           SELECT 1
           FROM public.dev_entitlements de
           WHERE de.user_id::text = u.id::text
         )',
      entitlements_user_id_type
    );

    EXECUTE '
      UPDATE public.dev_entitlements de
      SET tier = ''pending'',
          expires_at = NULL
      WHERE de.tier = ''admin''
        AND NOT EXISTS (
          SELECT 1
          FROM auth.users u
          WHERE u.id::text = de.user_id::text
            AND lower(u.email) IN (''marcaj777@gmail.com'', ''syncteamai@gmail.com'')
        )
    ';
  END IF;
END
$$;
