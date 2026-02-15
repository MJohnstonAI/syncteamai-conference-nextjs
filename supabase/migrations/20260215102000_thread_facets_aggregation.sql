-- Scale thread listing by avoiding full-message facet scans in API handlers.
-- Adds a compact aggregate RPC + supporting indexes for top-ranked root pagination.

CREATE INDEX IF NOT EXISTS idx_messages_conversation_root_rank
  ON public.messages (conversation_id, parent_message_id, score DESC, created_at DESC, id DESC)
  WHERE role = 'user';

CREATE INDEX IF NOT EXISTS idx_messages_conversation_avatar
  ON public.messages (conversation_id, avatar_id)
  WHERE avatar_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.get_thread_facets(p_conversation_id UUID)
RETURNS TABLE (
  facet_type TEXT,
  facet_id TEXT,
  created_at TIMESTAMPTZ,
  message_count BIGINT
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH scoped_messages AS (
    SELECT id, round_id, role, avatar_id, created_at
    FROM public.messages
    WHERE conversation_id = p_conversation_id
  ),
  round_facets AS (
    SELECT
      'round'::text AS facet_type,
      round_id::text AS facet_id,
      COALESCE(
        MIN(created_at) FILTER (WHERE role = 'user' AND id = round_id),
        MIN(created_at)
      ) AS created_at,
      COUNT(*)::bigint AS message_count
    FROM scoped_messages
    WHERE round_id IS NOT NULL
    GROUP BY round_id
  ),
  agent_facets AS (
    SELECT
      'agent'::text AS facet_type,
      avatar_id::text AS facet_id,
      NULL::timestamptz AS created_at,
      COUNT(*)::bigint AS message_count
    FROM scoped_messages
    WHERE avatar_id IS NOT NULL
    GROUP BY avatar_id
  )
  SELECT facet_type, facet_id, created_at, message_count
  FROM round_facets
  UNION ALL
  SELECT facet_type, facet_id, created_at, message_count
  FROM agent_facets;
$$;

GRANT EXECUTE ON FUNCTION public.get_thread_facets(UUID) TO authenticated;
