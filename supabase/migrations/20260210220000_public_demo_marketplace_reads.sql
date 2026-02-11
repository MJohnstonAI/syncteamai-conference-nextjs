-- Allow public/anon browsing of marketplace data for preset groups and demo templates.
-- Owner-scoped policies remain unchanged.

DO $$
BEGIN
  IF to_regclass('public.groups') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "preset readable" ON public.groups';

    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'groups'
        AND column_name = 'is_preset'
    ) THEN
      EXECUTE 'CREATE POLICY "preset readable" ON public.groups
        FOR SELECT
        USING (COALESCE(is_preset, false) = true)';
    END IF;
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.saved_prompts') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.saved_prompts ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "demo readable" ON public.saved_prompts';

    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'saved_prompts'
        AND column_name = 'is_demo'
    ) THEN
      EXECUTE 'CREATE POLICY "demo readable" ON public.saved_prompts
        FOR SELECT
        USING (COALESCE(is_demo, false) = true)';
    END IF;
  END IF;
END
$$;

