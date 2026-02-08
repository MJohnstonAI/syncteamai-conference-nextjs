-- Force-enable RLS and reset baseline owner policies for core app tables.
-- This migration is idempotent and tolerant of UUID/TEXT user_id column types.

DO $$
DECLARE
  p RECORD;
BEGIN
  IF to_regclass('public.conversations') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY';

    FOR p IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'conversations'
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.conversations', p.policyname);
    END LOOP;

    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'conversations'
        AND column_name = 'user_id'
    ) THEN
      EXECUTE 'CREATE POLICY "owner select" ON public.conversations
        FOR SELECT
        USING (auth.uid()::text = user_id::text)';

      EXECUTE 'CREATE POLICY "owner insert" ON public.conversations
        FOR INSERT
        WITH CHECK (auth.uid()::text = user_id::text)';

      EXECUTE 'CREATE POLICY "owner update" ON public.conversations
        FOR UPDATE
        USING (auth.uid()::text = user_id::text)
        WITH CHECK (auth.uid()::text = user_id::text)';

      EXECUTE 'CREATE POLICY "owner delete" ON public.conversations
        FOR DELETE
        USING (auth.uid()::text = user_id::text)';
    END IF;
  END IF;
END
$$;

DO $$
DECLARE
  p RECORD;
  messages_user_id_type TEXT;
  messages_user_id_fk_schema TEXT;
  messages_user_id_fk_table TEXT;
  messages_user_id_fk_column TEXT;
  backfill_sql TEXT;
BEGIN
  IF to_regclass('public.messages') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY';

    IF to_regclass('public.conversations') IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'messages'
          AND column_name = 'user_id'
      )
      AND EXISTS (
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
          AND table_name = 'conversations'
          AND column_name = 'id'
      )
      AND EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'conversations'
          AND column_name = 'user_id'
      )
    THEN
      SELECT format_type(a.atttypid, a.atttypmod)
        INTO messages_user_id_type
      FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'messages'
        AND a.attname = 'user_id'
        AND a.attnum > 0
        AND NOT a.attisdropped;

      IF messages_user_id_type IS NOT NULL THEN
        SELECT
          ns.nspname,
          rel.relname,
          att.attname
          INTO
            messages_user_id_fk_schema,
            messages_user_id_fk_table,
            messages_user_id_fk_column
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.confrelid
        JOIN pg_namespace ns ON ns.oid = rel.relnamespace
        JOIN pg_attribute att
          ON att.attrelid = con.confrelid
         AND att.attnum = con.confkey[1]
        WHERE con.conrelid = 'public.messages'::regclass
          AND con.conname = 'messages_user_id_fkey'
          AND con.contype = 'f'
        LIMIT 1;

        backfill_sql := format(
          'UPDATE public.messages m
           SET user_id = (c.user_id::text)::%1$s
           FROM public.conversations c
           WHERE m.conversation_id = c.id
             AND m.user_id IS NULL
             AND c.user_id IS NOT NULL',
          messages_user_id_type
        );

        IF messages_user_id_type IN ('uuid', 'pg_catalog.uuid') THEN
          backfill_sql := backfill_sql ||
            ' AND c.user_id::text ~* ''^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$''';
        END IF;

        IF messages_user_id_fk_schema IS NOT NULL
          AND messages_user_id_fk_table IS NOT NULL
          AND messages_user_id_fk_column IS NOT NULL
        THEN
          backfill_sql := backfill_sql || format(
            ' AND EXISTS (
                SELECT 1
                FROM %1$I.%2$I ref
                WHERE ref.%3$I::text = c.user_id::text
              )',
            messages_user_id_fk_schema,
            messages_user_id_fk_table,
            messages_user_id_fk_column
          );
        END IF;

        EXECUTE backfill_sql;
      END IF;
    END IF;

    FOR p IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'messages'
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.messages', p.policyname);
    END LOOP;

    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'messages'
        AND column_name = 'user_id'
    ) THEN
      EXECUTE 'CREATE POLICY "owner select" ON public.messages
        FOR SELECT
        USING (auth.uid()::text = user_id::text)';

      EXECUTE 'CREATE POLICY "owner insert" ON public.messages
        FOR INSERT
        WITH CHECK (auth.uid()::text = user_id::text)';

      EXECUTE 'CREATE POLICY "owner update" ON public.messages
        FOR UPDATE
        USING (auth.uid()::text = user_id::text)
        WITH CHECK (auth.uid()::text = user_id::text)';

      EXECUTE 'CREATE POLICY "owner delete" ON public.messages
        FOR DELETE
        USING (auth.uid()::text = user_id::text)';
    END IF;
  END IF;
END
$$;

DO $$
DECLARE
  p RECORD;
BEGIN
  IF to_regclass('public.groups') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY';

    FOR p IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'groups'
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.groups', p.policyname);
    END LOOP;

    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'groups'
        AND column_name = 'user_id'
    ) THEN
      EXECUTE 'CREATE POLICY "owner select" ON public.groups
        FOR SELECT
        USING (auth.uid()::text = user_id::text)';

      EXECUTE 'CREATE POLICY "owner insert" ON public.groups
        FOR INSERT
        WITH CHECK (
          auth.uid()::text = user_id::text
          AND COALESCE(is_preset, false) = false
        )';

      EXECUTE 'CREATE POLICY "owner update" ON public.groups
        FOR UPDATE
        USING (
          auth.uid()::text = user_id::text
          AND COALESCE(is_preset, false) = false
        )
        WITH CHECK (
          auth.uid()::text = user_id::text
          AND COALESCE(is_preset, false) = false
        )';

      EXECUTE 'CREATE POLICY "owner delete" ON public.groups
        FOR DELETE
        USING (
          auth.uid()::text = user_id::text
          AND COALESCE(is_preset, false) = false
        )';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'groups'
        AND column_name = 'is_preset'
    ) THEN
      EXECUTE 'CREATE POLICY "preset readable" ON public.groups
        FOR SELECT
        USING (
          auth.role() = ''authenticated''
          AND COALESCE(is_preset, false) = true
        )';
    END IF;
  END IF;
END
$$;

DO $$
DECLARE
  p RECORD;
BEGIN
  IF to_regclass('public.saved_prompts') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.saved_prompts ENABLE ROW LEVEL SECURITY';

    FOR p IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'saved_prompts'
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.saved_prompts', p.policyname);
    END LOOP;

    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'saved_prompts'
        AND column_name = 'user_id'
    ) THEN
      EXECUTE 'CREATE POLICY "owner select" ON public.saved_prompts
        FOR SELECT
        USING (auth.uid()::text = user_id::text)';

      EXECUTE 'CREATE POLICY "owner insert" ON public.saved_prompts
        FOR INSERT
        WITH CHECK (
          auth.uid()::text = user_id::text
          AND COALESCE(is_demo, false) = false
        )';

      EXECUTE 'CREATE POLICY "owner update" ON public.saved_prompts
        FOR UPDATE
        USING (
          auth.uid()::text = user_id::text
          AND COALESCE(is_demo, false) = false
        )
        WITH CHECK (
          auth.uid()::text = user_id::text
          AND COALESCE(is_demo, false) = false
        )';

      EXECUTE 'CREATE POLICY "owner delete" ON public.saved_prompts
        FOR DELETE
        USING (
          auth.uid()::text = user_id::text
          AND COALESCE(is_demo, false) = false
        )';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'saved_prompts'
        AND column_name = 'is_demo'
    ) THEN
      EXECUTE 'CREATE POLICY "demo readable" ON public.saved_prompts
        FOR SELECT
        USING (
          auth.role() = ''authenticated''
          AND COALESCE(is_demo, false) = true
        )';
    END IF;
  END IF;
END
$$;
