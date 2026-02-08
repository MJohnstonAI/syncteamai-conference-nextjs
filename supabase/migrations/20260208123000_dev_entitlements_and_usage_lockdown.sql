-- Temporary server-side entitlements and usage immutability hardening.

DO $$
DECLARE
  profiles_id_type TEXT;
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
    AND NOT a.attisdropped;

  IF profiles_id_type IS NULL THEN
    RAISE EXCEPTION 'Missing public.profiles.id column';
  END IF;

  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS public.dev_entitlements (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id %1$s NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
      tier TEXT NOT NULL,
      expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT dev_entitlements_user_unique UNIQUE (user_id),
      CONSTRAINT dev_entitlements_tier_check CHECK (tier IN (''pending'', ''free'', ''paid'', ''cancelled'', ''admin''))
    )',
    profiles_id_type
  );

  SELECT format_type(a.atttypid, a.atttypmod)
    INTO entitlements_user_id_type
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'dev_entitlements'
    AND a.attname = 'user_id'
    AND a.attnum > 0
    AND NOT a.attisdropped;

  IF entitlements_user_id_type IS DISTINCT FROM profiles_id_type THEN
    EXECUTE 'ALTER TABLE public.dev_entitlements DROP CONSTRAINT IF EXISTS dev_entitlements_user_id_fkey';
    EXECUTE format(
      'ALTER TABLE public.dev_entitlements ALTER COLUMN user_id TYPE %1$s USING user_id::text::%1$s',
      profiles_id_type
    );
    EXECUTE 'ALTER TABLE public.dev_entitlements ADD CONSTRAINT dev_entitlements_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE';
  END IF;
END
$$;

ALTER TABLE public.dev_entitlements ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_admin_safe(_user_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF to_regprocedure('public.is_admin(text)') IS NOT NULL THEN
    RETURN public.is_admin(_user_id);
  ELSIF to_regprocedure('public.is_admin(uuid)') IS NOT NULL THEN
    RETURN public.is_admin(_user_id::uuid);
  END IF;
  RETURN false;
END;
$$;

DROP POLICY IF EXISTS "Users can view their own entitlements" ON public.dev_entitlements;
CREATE POLICY "Users can view their own entitlements"
  ON public.dev_entitlements FOR SELECT
  USING (auth.uid()::text = user_id::text);

DROP POLICY IF EXISTS "Admins can manage entitlements" ON public.dev_entitlements;
CREATE POLICY "Admins can manage entitlements"
  ON public.dev_entitlements FOR ALL
  USING (public.is_admin_safe(auth.uid()::text))
  WITH CHECK (public.is_admin_safe(auth.uid()::text));

CREATE INDEX IF NOT EXISTS idx_dev_entitlements_user_id
  ON public.dev_entitlements(user_id);

DROP TRIGGER IF EXISTS set_dev_entitlements_updated_at ON public.dev_entitlements;
CREATE TRIGGER set_dev_entitlements_updated_at
  BEFORE UPDATE ON public.dev_entitlements
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.turn_usage_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can insert their own usage events" ON public.turn_usage_events;
DROP POLICY IF EXISTS "Users can update their own usage events" ON public.turn_usage_events;
DROP POLICY IF EXISTS "Users can delete their own usage events" ON public.turn_usage_events;
