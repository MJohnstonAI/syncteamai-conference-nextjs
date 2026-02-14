-- BYOK hardening: validation metadata + audit events.

ALTER TABLE public.user_api_keys
  ADD COLUMN IF NOT EXISTS encryption_kid TEXT;

ALTER TABLE public.user_api_keys
  ADD COLUMN IF NOT EXISTS last_validated_at TIMESTAMPTZ;

ALTER TABLE public.user_api_keys
  ADD COLUMN IF NOT EXISTS last_validation_status TEXT;

ALTER TABLE public.user_api_keys
  ADD COLUMN IF NOT EXISTS last_validation_error TEXT;

UPDATE public.user_api_keys
SET encryption_kid = NULLIF(split_part(encrypted_key, ':', 2), '')
WHERE encrypted_key LIKE 'v2:%'
  AND (encryption_kid IS NULL OR encryption_kid = '');

UPDATE public.user_api_keys
SET last_validation_status = CASE
  WHEN store_key = true AND encrypted_key IS NOT NULL THEN 'success'
  ELSE 'unknown'
END
WHERE last_validation_status IS NULL;

UPDATE public.user_api_keys
SET last_validated_at = COALESCE(last_validated_at, updated_at)
WHERE store_key = true
  AND encrypted_key IS NOT NULL;

UPDATE public.user_api_keys
SET last_validated_at = NULL,
    last_validation_error = NULL
WHERE store_key = false;

ALTER TABLE public.user_api_keys
  ALTER COLUMN last_validation_status SET DEFAULT 'unknown';

ALTER TABLE public.user_api_keys
  ALTER COLUMN last_validation_status SET NOT NULL;

ALTER TABLE public.user_api_keys
  DROP CONSTRAINT IF EXISTS user_api_keys_last_validation_status_check;

ALTER TABLE public.user_api_keys
  ADD CONSTRAINT user_api_keys_last_validation_status_check CHECK (
    last_validation_status IN ('unknown', 'success', 'failed')
  );

ALTER TABLE public.user_api_keys
  DROP CONSTRAINT IF EXISTS user_api_keys_last_validation_error_length_check;

ALTER TABLE public.user_api_keys
  ADD CONSTRAINT user_api_keys_last_validation_error_length_check CHECK (
    last_validation_error IS NULL OR char_length(last_validation_error) <= 500
  );

CREATE INDEX IF NOT EXISTS idx_user_api_keys_validation_status
  ON public.user_api_keys(user_id, last_validation_status, last_validated_at DESC);

DO $$
DECLARE
  profiles_id_type TEXT;
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
    'CREATE TABLE IF NOT EXISTS public.user_api_key_audit_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id %1$s NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      action TEXT NOT NULL,
      success BOOLEAN NOT NULL,
      status_code INTEGER,
      error_code TEXT,
      ip_hash TEXT,
      user_agent_hash TEXT,
      metadata JSONB NOT NULL DEFAULT ''{}''::jsonb,
      source TEXT NOT NULL DEFAULT ''api'',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT user_api_key_audit_events_provider_check CHECK (
        provider IN (''openrouter'')
      ),
      CONSTRAINT user_api_key_audit_events_action_check CHECK (
        action IN (''validate'', ''save'', ''remove'', ''status_check'')
      )
    )',
    profiles_id_type
  );
END
$$;

ALTER TABLE public.user_api_key_audit_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own BYOK audit events"
  ON public.user_api_key_audit_events;
CREATE POLICY "Users can view their own BYOK audit events"
  ON public.user_api_key_audit_events FOR SELECT
  USING (auth.uid()::text = user_id::text);

DROP POLICY IF EXISTS "Users can insert their own BYOK audit events"
  ON public.user_api_key_audit_events;
CREATE POLICY "Users can insert their own BYOK audit events"
  ON public.user_api_key_audit_events FOR INSERT
  WITH CHECK (auth.uid()::text = user_id::text);

DROP POLICY IF EXISTS "Admins can view BYOK audit events"
  ON public.user_api_key_audit_events;
CREATE POLICY "Admins can view BYOK audit events"
  ON public.user_api_key_audit_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id::text = auth.uid()::text
        AND ur.role::text = 'admin'
    )
  );

CREATE INDEX IF NOT EXISTS idx_user_api_key_audit_events_user_created
  ON public.user_api_key_audit_events(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_api_key_audit_events_action_created
  ON public.user_api_key_audit_events(provider, action, created_at DESC);
