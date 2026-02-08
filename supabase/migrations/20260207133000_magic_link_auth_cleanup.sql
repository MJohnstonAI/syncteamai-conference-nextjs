-- Remove Clerk-specific auth remnants and normalize policies for Supabase Auth.

ALTER TABLE public.user_roles
  DROP COLUMN IF EXISTS clerk_user_id;

DROP INDEX IF EXISTS idx_user_roles_clerk_user_id;

-- Ensure conversation/message user IDs are text-compatible with auth.uid()::text checks.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'conversations'
      AND column_name = 'user_id'
      AND data_type <> 'text'
  ) THEN
    ALTER TABLE public.conversations
      ALTER COLUMN user_id TYPE TEXT USING user_id::text;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'messages'
      AND column_name = 'user_id'
      AND data_type <> 'text'
  ) THEN
    ALTER TABLE public.messages
      ALTER COLUMN user_id TYPE TEXT USING user_id::text;
  END IF;
END
$$;

DROP POLICY IF EXISTS "Users can view their own conversations" ON public.conversations;
DROP POLICY IF EXISTS "Users can create their own conversations" ON public.conversations;
DROP POLICY IF EXISTS "Users can update their own conversations" ON public.conversations;
DROP POLICY IF EXISTS "Users can delete their own conversations" ON public.conversations;
DROP POLICY IF EXISTS "Admins can view all conversations" ON public.conversations;
DROP POLICY IF EXISTS "Admins can update all conversations" ON public.conversations;
DROP POLICY IF EXISTS "Admins can delete all conversations" ON public.conversations;

CREATE POLICY "Users can view their own conversations"
  ON public.conversations FOR SELECT
  USING (auth.uid()::text = user_id);

CREATE POLICY "Users can create their own conversations"
  ON public.conversations FOR INSERT
  WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Users can update their own conversations"
  ON public.conversations FOR UPDATE
  USING (auth.uid()::text = user_id);

CREATE POLICY "Users can delete their own conversations"
  ON public.conversations FOR DELETE
  USING (auth.uid()::text = user_id);

CREATE POLICY "Admins can view all conversations"
  ON public.conversations FOR SELECT
  USING (public.is_admin(auth.uid()::text));

CREATE POLICY "Admins can update all conversations"
  ON public.conversations FOR UPDATE
  USING (public.is_admin(auth.uid()::text));

CREATE POLICY "Admins can delete all conversations"
  ON public.conversations FOR DELETE
  USING (public.is_admin(auth.uid()::text));

DROP POLICY IF EXISTS "Users can view messages in their conversations" ON public.messages;
DROP POLICY IF EXISTS "Users can create messages in their conversations" ON public.messages;
DROP POLICY IF EXISTS "Admins can view all messages" ON public.messages;
DROP POLICY IF EXISTS "Admins can create all messages" ON public.messages;
DROP POLICY IF EXISTS "Admins can delete all messages" ON public.messages;

CREATE POLICY "Users can view messages in their conversations"
  ON public.messages FOR SELECT
  USING (auth.uid()::text = user_id);

CREATE POLICY "Users can create messages in their conversations"
  ON public.messages FOR INSERT
  WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Admins can view all messages"
  ON public.messages FOR SELECT
  USING (public.is_admin(auth.uid()::text));

CREATE POLICY "Admins can create all messages"
  ON public.messages FOR INSERT
  WITH CHECK (public.is_admin(auth.uid()::text));

CREATE POLICY "Admins can delete all messages"
  ON public.messages FOR DELETE
  USING (public.is_admin(auth.uid()::text));
