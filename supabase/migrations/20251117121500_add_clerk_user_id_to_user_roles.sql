-- Add Clerk mapping column to canonical user record table

ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS clerk_user_id TEXT UNIQUE;

CREATE INDEX IF NOT EXISTS idx_user_roles_clerk_user_id
  ON public.user_roles(clerk_user_id);

