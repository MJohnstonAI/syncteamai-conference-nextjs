-- Canonical BYOK schema: remove legacy last_four, enforce key_last4 + store_key.

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  profiles_id_type TEXT;
  user_api_keys_user_id_type TEXT;
  has_user_api_keys BOOLEAN;
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

  SELECT to_regclass('public.user_api_keys') IS NOT NULL INTO has_user_api_keys;

  IF NOT has_user_api_keys THEN
    EXECUTE format(
      'CREATE TABLE public.user_api_keys (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id %1$s NOT NULL,
        provider TEXT NOT NULL,
        encrypted_key TEXT,
        key_last4 TEXT,
        store_key BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )',
      profiles_id_type
    );
  END IF;

  ALTER TABLE public.user_api_keys
    ADD COLUMN IF NOT EXISTS key_last4 TEXT;

  ALTER TABLE public.user_api_keys
    ADD COLUMN IF NOT EXISTS store_key BOOLEAN;

  ALTER TABLE public.user_api_keys
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

  ALTER TABLE public.user_api_keys
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

  SELECT format_type(a.atttypid, a.atttypmod)
    INTO user_api_keys_user_id_type
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'user_api_keys'
    AND a.attname = 'user_id'
    AND a.attnum > 0
    AND NOT a.attisdropped;

  IF user_api_keys_user_id_type IS DISTINCT FROM profiles_id_type THEN
    EXECUTE 'ALTER TABLE public.user_api_keys DROP CONSTRAINT IF EXISTS user_api_keys_user_id_fkey';
    EXECUTE format(
      'ALTER TABLE public.user_api_keys ALTER COLUMN user_id TYPE %1$s USING user_id::text::%1$s',
      profiles_id_type
    );
  END IF;

  EXECUTE '
    DELETE FROM public.user_api_keys u
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id::text = u.user_id::text
    )
  ';

  EXECUTE 'ALTER TABLE public.user_api_keys DROP CONSTRAINT IF EXISTS user_api_keys_user_id_fkey';
  EXECUTE 'ALTER TABLE public.user_api_keys ADD CONSTRAINT user_api_keys_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE';
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'user_api_keys'
      AND column_name = 'last_four'
  ) THEN
    EXECUTE '
      UPDATE public.user_api_keys
      SET key_last4 = RIGHT(last_four, 4)
      WHERE key_last4 IS NULL
        AND last_four IS NOT NULL
    ';
  END IF;
END
$$;

UPDATE public.user_api_keys
SET key_last4 = RIGHT(key_last4, 4)
WHERE key_last4 IS NOT NULL
  AND char_length(key_last4) > 4;

UPDATE public.user_api_keys
SET store_key = (encrypted_key IS NOT NULL)
WHERE store_key IS NULL;

DELETE FROM public.user_api_keys
WHERE provider IS DISTINCT FROM 'openrouter';

UPDATE public.user_api_keys
SET key_last4 = NULL
WHERE store_key = false;

ALTER TABLE public.user_api_keys
  ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE public.user_api_keys
  ALTER COLUMN provider SET NOT NULL;

ALTER TABLE public.user_api_keys
  ALTER COLUMN store_key SET DEFAULT false;

ALTER TABLE public.user_api_keys
  ALTER COLUMN store_key SET NOT NULL;

ALTER TABLE public.user_api_keys
  DROP CONSTRAINT IF EXISTS user_api_keys_provider_check;

ALTER TABLE public.user_api_keys
  ADD CONSTRAINT user_api_keys_provider_check CHECK (provider IN ('openrouter'));

ALTER TABLE public.user_api_keys
  DROP CONSTRAINT IF EXISTS user_api_keys_last4_check;

ALTER TABLE public.user_api_keys
  ADD CONSTRAINT user_api_keys_last4_check CHECK (
    key_last4 IS NULL OR char_length(key_last4) BETWEEN 1 AND 4
  );

ALTER TABLE public.user_api_keys
  DROP CONSTRAINT IF EXISTS user_api_keys_store_state_check;

ALTER TABLE public.user_api_keys
  ADD CONSTRAINT user_api_keys_store_state_check CHECK (
    (
      store_key = true
      AND encrypted_key IS NOT NULL
      AND key_last4 IS NOT NULL
    )
    OR (
      store_key = false
      AND encrypted_key IS NULL
      AND key_last4 IS NULL
    )
  );

WITH ranked AS (
  SELECT
    ctid,
    row_number() OVER (
      PARTITION BY user_id, provider
      ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, ctid DESC
    ) AS rn
  FROM public.user_api_keys
)
DELETE FROM public.user_api_keys u
USING ranked r
WHERE u.ctid = r.ctid
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_api_keys_user_provider_unique
  ON public.user_api_keys(user_id, provider);

ALTER TABLE public.user_api_keys
  DROP CONSTRAINT IF EXISTS user_api_keys_user_provider_unique;

ALTER TABLE public.user_api_keys
  ADD CONSTRAINT user_api_keys_user_provider_unique
  UNIQUE USING INDEX idx_user_api_keys_user_provider_unique;

ALTER TABLE public.user_api_keys
  DROP COLUMN IF EXISTS last_four;

ALTER TABLE public.user_api_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own api keys" ON public.user_api_keys;
CREATE POLICY "Users can view their own api keys"
  ON public.user_api_keys FOR SELECT
  USING (auth.uid()::text = user_id::text);

DROP POLICY IF EXISTS "Users can insert their own api keys" ON public.user_api_keys;
CREATE POLICY "Users can insert their own api keys"
  ON public.user_api_keys FOR INSERT
  WITH CHECK (auth.uid()::text = user_id::text);

DROP POLICY IF EXISTS "Users can update their own api keys" ON public.user_api_keys;
CREATE POLICY "Users can update their own api keys"
  ON public.user_api_keys FOR UPDATE
  USING (auth.uid()::text = user_id::text)
  WITH CHECK (auth.uid()::text = user_id::text);

DROP POLICY IF EXISTS "Users can delete their own api keys" ON public.user_api_keys;
CREATE POLICY "Users can delete their own api keys"
  ON public.user_api_keys FOR DELETE
  USING (auth.uid()::text = user_id::text);

DROP POLICY IF EXISTS "Admins can read api keys metadata" ON public.user_api_keys;
CREATE POLICY "Admins can read api keys metadata"
  ON public.user_api_keys FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id::text = auth.uid()::text
        AND ur.role::text = 'admin'
    )
  );

CREATE INDEX IF NOT EXISTS idx_user_api_keys_user_updated
  ON public.user_api_keys(user_id, updated_at DESC);

DROP TRIGGER IF EXISTS set_user_api_keys_updated_at ON public.user_api_keys;
CREATE TRIGGER set_user_api_keys_updated_at
  BEFORE UPDATE ON public.user_api_keys
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
