-- ============================================
-- SCALABILITY & PERFORMANCE OPTIMIZATION
-- ============================================

-- 1. ADD CRITICAL INDEXES FOR QUERY PERFORMANCE
-- These indexes will dramatically improve query speed at scale

-- Index for conversations lookup by user
CREATE INDEX IF NOT EXISTS idx_conversations_user_id 
ON public.conversations(user_id);

-- Index for conversations by creation date (for pagination)
CREATE INDEX IF NOT EXISTS idx_conversations_user_created 
ON public.conversations(user_id, created_at DESC);

-- Index for messages by conversation (primary query pattern)
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id 
ON public.messages(conversation_id, created_at ASC);

-- Composite index for RLS policy performance (avoids sequential scans)
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created 
ON public.messages(conversation_id, created_at DESC);

-- Index for saved_prompts by owner
CREATE INDEX IF NOT EXISTS idx_saved_prompts_owner_id 
ON public.saved_prompts(owner_id, created_at DESC);

-- Index for saved_prompts by group
CREATE INDEX IF NOT EXISTS idx_saved_prompts_group_id 
ON public.saved_prompts(group_id, is_demo);

-- Index for groups by owner and preset status
CREATE INDEX IF NOT EXISTS idx_groups_owner_preset 
ON public.groups(owner_id, is_preset);


-- 2. OPTIMIZE RLS POLICIES WITH MATERIALIZED PATHS
-- Current RLS policies cause subquery evaluation on every row
-- Add a denormalized user_id to messages for faster RLS checks

ALTER TABLE public.messages 
ADD COLUMN IF NOT EXISTS user_id UUID;

-- Backfill existing messages with user_id from conversations
UPDATE public.messages m
SET user_id = c.user_id
FROM public.conversations c
WHERE m.conversation_id = c.id
AND m.user_id IS NULL;

-- Create index on the new user_id column
CREATE INDEX IF NOT EXISTS idx_messages_user_id 
ON public.messages(user_id);

-- Create function to auto-populate user_id on insert
CREATE OR REPLACE FUNCTION public.set_message_user_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  SELECT user_id INTO NEW.user_id
  FROM public.conversations
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

-- Create trigger to auto-set user_id
DROP TRIGGER IF EXISTS set_message_user_id_trigger ON public.messages;
CREATE TRIGGER set_message_user_id_trigger
  BEFORE INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.set_message_user_id();

-- Replace the expensive RLS policies with optimized versions
DROP POLICY IF EXISTS "Users can view messages in their conversations" ON public.messages;
CREATE POLICY "Users can view messages in their conversations"
  ON public.messages FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create messages in their conversations" ON public.messages;
CREATE POLICY "Users can create messages in their conversations"
  ON public.messages FOR INSERT
  WITH CHECK (auth.uid() = user_id);


-- 3. ADD ANALYTICS INDEXES FOR ADMIN QUERIES
CREATE INDEX IF NOT EXISTS idx_conversations_created_at 
ON public.conversations(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_created_at 
ON public.messages(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_profiles_tier 
ON public.profiles(tier);


-- 4. OPTIMIZE TEXT SEARCH (if needed for future features)
-- Add GIN index for full-text search on message content
CREATE INDEX IF NOT EXISTS idx_messages_content_gin 
ON public.messages USING gin(to_tsvector('english', content));

CREATE INDEX IF NOT EXISTS idx_conversations_title_gin 
ON public.conversations USING gin(to_tsvector('english', title));


-- 5. PARTITIONING PREPARATION (for future scaling to millions)
-- Add comment for future partitioning strategy
COMMENT ON TABLE public.messages IS 
'Consider partitioning by created_at (monthly) when table exceeds 10M rows';

COMMENT ON TABLE public.conversations IS 
'Consider partitioning by created_at (yearly) when table exceeds 1M rows';