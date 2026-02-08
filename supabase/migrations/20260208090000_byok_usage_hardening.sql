-- Phase 2 hardening: BYOK storage, usage metering, and policy/index tightening.
-- This migration is schema-tolerant for environments where IDs may be UUID or TEXT.

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
    'CREATE TABLE IF NOT EXISTS public.user_api_keys (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id %1$s NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      encrypted_key TEXT,
      key_last4 TEXT,
      store_key BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT user_api_keys_user_provider_unique UNIQUE (user_id, provider),
      CONSTRAINT user_api_keys_provider_check CHECK (provider IN (''openrouter'')),
      CONSTRAINT user_api_keys_last4_check CHECK (
        key_last4 IS NULL OR char_length(key_last4) <= 4
      )
    )',
    profiles_id_type
  );

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
    EXECUTE 'ALTER TABLE public.user_api_keys ADD CONSTRAINT user_api_keys_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE';
  END IF;
END
$$;

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


DO $$
DECLARE
  profiles_id_type TEXT;
  conversations_id_type TEXT;
  has_conversations BOOLEAN;
  turn_usage_events_user_id_type TEXT;
  turn_usage_events_conversation_id_type TEXT;
  conversation_column_ddl TEXT;
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

  SELECT to_regclass('public.conversations') IS NOT NULL INTO has_conversations;

  IF has_conversations THEN
    SELECT format_type(a.atttypid, a.atttypmod)
      INTO conversations_id_type
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'conversations'
      AND a.attname = 'id'
      AND a.attnum > 0
      AND NOT a.attisdropped;
  ELSE
    conversations_id_type := 'uuid';
  END IF;

  IF has_conversations THEN
    conversation_column_ddl := conversations_id_type || ' REFERENCES public.conversations(id) ON DELETE SET NULL';
  ELSE
    conversation_column_ddl := 'uuid';
  END IF;

  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS public.turn_usage_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id %1$s NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
      conversation_id %2$s,
      round_id TEXT,
      provider TEXT NOT NULL,
      model_id TEXT NOT NULL,
      prompt_tokens INTEGER,
      completion_tokens INTEGER,
      total_tokens INTEGER,
      unit_price_usd NUMERIC(12,6),
      cost_cents INTEGER,
      latency_ms INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL,
      status_code INTEGER,
      request_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT turn_usage_events_provider_check CHECK (provider IN (''openrouter'')),
      CONSTRAINT turn_usage_events_status_check CHECK (status IN (''success'', ''error'')),
      CONSTRAINT turn_usage_events_prompt_tokens_nonnegative CHECK (
        prompt_tokens IS NULL OR prompt_tokens >= 0
      ),
      CONSTRAINT turn_usage_events_completion_tokens_nonnegative CHECK (
        completion_tokens IS NULL OR completion_tokens >= 0
      ),
      CONSTRAINT turn_usage_events_total_tokens_nonnegative CHECK (
        total_tokens IS NULL OR total_tokens >= 0
      ),
      CONSTRAINT turn_usage_events_cost_nonnegative CHECK (
        cost_cents IS NULL OR cost_cents >= 0
      ),
      CONSTRAINT turn_usage_events_latency_nonnegative CHECK (latency_ms >= 0)
    )',
    profiles_id_type,
    conversation_column_ddl
  );

  SELECT format_type(a.atttypid, a.atttypmod)
    INTO turn_usage_events_user_id_type
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'turn_usage_events'
    AND a.attname = 'user_id'
    AND a.attnum > 0
    AND NOT a.attisdropped;

  IF turn_usage_events_user_id_type IS DISTINCT FROM profiles_id_type THEN
    EXECUTE 'ALTER TABLE public.turn_usage_events DROP CONSTRAINT IF EXISTS turn_usage_events_user_id_fkey';
    EXECUTE format(
      'ALTER TABLE public.turn_usage_events ALTER COLUMN user_id TYPE %1$s USING user_id::text::%1$s',
      profiles_id_type
    );
    EXECUTE 'ALTER TABLE public.turn_usage_events ADD CONSTRAINT turn_usage_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE';
  END IF;

  IF has_conversations THEN
    SELECT format_type(a.atttypid, a.atttypmod)
      INTO turn_usage_events_conversation_id_type
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'turn_usage_events'
      AND a.attname = 'conversation_id'
      AND a.attnum > 0
      AND NOT a.attisdropped;

    IF turn_usage_events_conversation_id_type IS DISTINCT FROM conversations_id_type THEN
      EXECUTE 'ALTER TABLE public.turn_usage_events DROP CONSTRAINT IF EXISTS turn_usage_events_conversation_id_fkey';
      EXECUTE format(
        'ALTER TABLE public.turn_usage_events ALTER COLUMN conversation_id TYPE %1$s USING conversation_id::text::%1$s',
        conversations_id_type
      );
      EXECUTE 'ALTER TABLE public.turn_usage_events ADD CONSTRAINT turn_usage_events_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE SET NULL';
    END IF;
  END IF;
END
$$;

ALTER TABLE public.turn_usage_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own usage events" ON public.turn_usage_events;
CREATE POLICY "Users can view their own usage events"
  ON public.turn_usage_events FOR SELECT
  USING (auth.uid()::text = user_id::text);

DROP POLICY IF EXISTS "Users can insert their own usage events" ON public.turn_usage_events;
CREATE POLICY "Users can insert their own usage events"
  ON public.turn_usage_events FOR INSERT
  WITH CHECK (auth.uid()::text = user_id::text);

DROP POLICY IF EXISTS "Users can update their own usage events" ON public.turn_usage_events;
CREATE POLICY "Users can update their own usage events"
  ON public.turn_usage_events FOR UPDATE
  USING (auth.uid()::text = user_id::text)
  WITH CHECK (auth.uid()::text = user_id::text);

DROP POLICY IF EXISTS "Users can delete their own usage events" ON public.turn_usage_events;
CREATE POLICY "Users can delete their own usage events"
  ON public.turn_usage_events FOR DELETE
  USING (auth.uid()::text = user_id::text);

DROP POLICY IF EXISTS "Admins can view all usage events" ON public.turn_usage_events;
CREATE POLICY "Admins can view all usage events"
  ON public.turn_usage_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id::text = auth.uid()::text
        AND ur.role::text = 'admin'
    )
  );

CREATE INDEX IF NOT EXISTS idx_turn_usage_events_user_created
  ON public.turn_usage_events(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_turn_usage_events_conversation_created
  ON public.turn_usage_events(conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_turn_usage_events_round_created
  ON public.turn_usage_events(round_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_turn_usage_events_request_id
  ON public.turn_usage_events(request_id);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'conversations'
      AND column_name = 'user_id'
  )
  AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'conversations'
      AND column_name = 'updated_at'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_conversations_user_updated ON public.conversations(user_id, updated_at DESC)';
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'messages'
      AND column_name = 'conversation_id'
  )
  AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'messages'
      AND column_name = 'created_at'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_messages_conversation_created_desc ON public.messages(conversation_id, created_at DESC)';
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'messages'
      AND column_name = 'user_id'
  ) THEN
    EXECUTE 'DROP POLICY IF EXISTS "Users can update messages in their conversations" ON public.messages';
    EXECUTE 'CREATE POLICY "Users can update messages in their conversations"
      ON public.messages FOR UPDATE
      USING (auth.uid()::text = user_id::text)
      WITH CHECK (auth.uid()::text = user_id::text)';

    EXECUTE 'DROP POLICY IF EXISTS "Users can delete messages in their conversations" ON public.messages';
    EXECUTE 'CREATE POLICY "Users can delete messages in their conversations"
      ON public.messages FOR DELETE
      USING (auth.uid()::text = user_id::text)';
  END IF;
END
$$;
