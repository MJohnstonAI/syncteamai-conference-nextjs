-- Persist AI panel configurations between Templates and Conference.
-- Owner-only by default with explicit RLS policies.

CREATE TABLE IF NOT EXISTS public.conference_configurations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.saved_prompts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  selected_mode TEXT NOT NULL DEFAULT 'quick-start',
  is_draft BOOLEAN NOT NULL DEFAULT false,

  template_title TEXT,
  template_script TEXT,
  problem_statement TEXT,

  problem_type TEXT,
  complexity_score INTEGER,
  recommended_strategy TEXT,
  strategy_reason TEXT,
  key_considerations JSONB,

  expert_panel JSONB NOT NULL DEFAULT '[]'::jsonb,
  analysis_payload JSONB,

  estimated_cost_min NUMERIC(10,2),
  estimated_cost_max NUMERIC(10,2),
  estimated_duration INTEGER,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT conference_configurations_mode_check
    CHECK (selected_mode IN ('quick-start', 'custom'))
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'conference_configurations_template_id_key'
      AND conrelid = 'public.conference_configurations'::regclass
  ) THEN
    ALTER TABLE public.conference_configurations
      ADD CONSTRAINT conference_configurations_template_id_key UNIQUE (template_id);
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_conference_configurations_template
  ON public.conference_configurations(template_id);

CREATE INDEX IF NOT EXISTS idx_conference_configurations_user
  ON public.conference_configurations(user_id);

CREATE INDEX IF NOT EXISTS idx_conference_configurations_created_at
  ON public.conference_configurations(created_at DESC);

ALTER TABLE public.conference_configurations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner select" ON public.conference_configurations;
DROP POLICY IF EXISTS "owner insert" ON public.conference_configurations;
DROP POLICY IF EXISTS "owner update" ON public.conference_configurations;
DROP POLICY IF EXISTS "owner delete" ON public.conference_configurations;
DROP POLICY IF EXISTS "config select policy" ON public.conference_configurations;
DROP POLICY IF EXISTS "config insert policy" ON public.conference_configurations;
DROP POLICY IF EXISTS "config update policy" ON public.conference_configurations;
DROP POLICY IF EXISTS "config delete policy" ON public.conference_configurations;

CREATE POLICY "config select policy" ON public.conference_configurations
FOR SELECT
USING (
  auth.uid()::text = user_id::text
  OR EXISTS (
    SELECT 1
    FROM public.saved_prompts p
    WHERE p.id = template_id
      AND COALESCE(p.is_demo, false) = true
  )
);

CREATE POLICY "config insert policy" ON public.conference_configurations
FOR INSERT
WITH CHECK (
  (
    user_id::text = auth.uid()::text
    AND EXISTS (
      SELECT 1
      FROM public.saved_prompts p
      WHERE p.id = template_id
        AND COALESCE(p.is_demo, false) = false
        AND p.user_id::text = auth.uid()::text
    )
  )
  OR (
    user_id::text = auth.uid()::text
    AND public.is_admin_safe(auth.uid()::text)
    AND EXISTS (
      SELECT 1
      FROM public.saved_prompts p
      WHERE p.id = template_id
        AND COALESCE(p.is_demo, false) = true
        AND p.user_id::text = auth.uid()::text
    )
  )
);

CREATE POLICY "config update policy" ON public.conference_configurations
FOR UPDATE
USING (
  (
    user_id::text = auth.uid()::text
    AND EXISTS (
      SELECT 1
      FROM public.saved_prompts p
      WHERE p.id = template_id
        AND COALESCE(p.is_demo, false) = false
        AND p.user_id::text = auth.uid()::text
    )
  )
  OR (
    user_id::text = auth.uid()::text
    AND public.is_admin_safe(auth.uid()::text)
    AND EXISTS (
      SELECT 1
      FROM public.saved_prompts p
      WHERE p.id = template_id
        AND COALESCE(p.is_demo, false) = true
        AND p.user_id::text = auth.uid()::text
    )
  )
)
WITH CHECK (
  (
    user_id::text = auth.uid()::text
    AND EXISTS (
      SELECT 1
      FROM public.saved_prompts p
      WHERE p.id = template_id
        AND COALESCE(p.is_demo, false) = false
        AND p.user_id::text = auth.uid()::text
    )
  )
  OR (
    user_id::text = auth.uid()::text
    AND public.is_admin_safe(auth.uid()::text)
    AND EXISTS (
      SELECT 1
      FROM public.saved_prompts p
      WHERE p.id = template_id
        AND COALESCE(p.is_demo, false) = true
        AND p.user_id::text = auth.uid()::text
    )
  )
);

CREATE POLICY "config delete policy" ON public.conference_configurations
FOR DELETE
USING (
  (
    user_id::text = auth.uid()::text
    AND EXISTS (
      SELECT 1
      FROM public.saved_prompts p
      WHERE p.id = template_id
        AND COALESCE(p.is_demo, false) = false
        AND p.user_id::text = auth.uid()::text
    )
  )
  OR (
    user_id::text = auth.uid()::text
    AND public.is_admin_safe(auth.uid()::text)
    AND EXISTS (
      SELECT 1
      FROM public.saved_prompts p
      WHERE p.id = template_id
        AND COALESCE(p.is_demo, false) = true
        AND p.user_id::text = auth.uid()::text
    )
  )
);

DO $$
BEGIN
  IF to_regprocedure('public.handle_updated_at()') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS set_conference_configurations_updated_at ON public.conference_configurations';
    EXECUTE 'CREATE TRIGGER set_conference_configurations_updated_at
      BEFORE UPDATE ON public.conference_configurations
      FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at()';
  END IF;
END
$$;
