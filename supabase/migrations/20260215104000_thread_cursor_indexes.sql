-- Optimize primary thread read paths:
-- 1) Conversation-wide cursor paging ordered by sort_key + created_at
-- 2) Round-scoped cursor paging ordered by sort_key + created_at

CREATE INDEX IF NOT EXISTS idx_messages_conversation_sortkey_created
  ON public.messages (conversation_id, sort_key, created_at);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_round_sortkey_created
  ON public.messages (conversation_id, round_id, sort_key, created_at);
