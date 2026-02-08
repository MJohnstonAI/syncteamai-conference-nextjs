-- Track which saved_prompt spawned each conversation

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS prompt_script_id UUID REFERENCES public.saved_prompts(id);

CREATE INDEX IF NOT EXISTS idx_conversations_prompt_script
  ON public.conversations(prompt_script_id);

-- Drop redundant index that was auto-created for a temporary constraint in user_roles
ALTER TABLE public.user_roles
  DROP CONSTRAINT IF EXISTS user_roles_user_id_role_unique;

DROP INDEX IF EXISTS user_roles_user_id_role_unique;
