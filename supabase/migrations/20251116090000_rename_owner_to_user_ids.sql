-- Rename legacy owner_id columns to user_id for consistency

ALTER TABLE public.groups
  RENAME COLUMN owner_id TO user_id;

ALTER TABLE public.saved_prompts
  RENAME COLUMN owner_id TO user_id;

-- Drop deprecated Clerk owner tracking columns
ALTER TABLE public.groups
  DROP COLUMN IF EXISTS clerk_owner_id;

ALTER TABLE public.saved_prompts
  DROP COLUMN IF EXISTS clerk_owner_id;

-- Rename supporting indexes
ALTER INDEX IF EXISTS idx_groups_owner
  RENAME TO idx_groups_user;

ALTER INDEX IF EXISTS idx_groups_owner_id
  RENAME TO idx_groups_user_id;

ALTER INDEX IF EXISTS idx_prompts_owner
  RENAME TO idx_saved_prompts_user;

ALTER INDEX IF EXISTS idx_saved_prompts_owner_id
  RENAME TO idx_saved_prompts_user_id;

-- Rename foreign key constraints when present
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'groups_owner_id_fkey'
  ) THEN
    ALTER TABLE public.groups
      RENAME CONSTRAINT groups_owner_id_fkey TO groups_user_id_fkey;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'saved_prompts_owner_id_fkey'
  ) THEN
    ALTER TABLE public.saved_prompts
      RENAME CONSTRAINT saved_prompts_owner_id_fkey TO saved_prompts_user_id_fkey;
  END IF;
END$$;
