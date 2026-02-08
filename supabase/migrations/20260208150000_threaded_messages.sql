-- Threaded debate support on top of existing conversations/messages model.

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS parent_message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS thread_root_id UUID REFERENCES public.messages(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS depth SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sort_key TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS round_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS score INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_highlight BOOLEAN NOT NULL DEFAULT FALSE;

CREATE OR REPLACE FUNCTION public.set_message_thread_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  parent_row public.messages%ROWTYPE;
  segment TEXT;
BEGIN
  IF NEW.id IS NULL THEN
    NEW.id := gen_random_uuid();
  END IF;

  IF NEW.created_at IS NULL THEN
    NEW.created_at := now();
  END IF;

  segment := to_char(timezone('utc', NEW.created_at), 'YYYYMMDDHH24MISSMS')
    || '-'
    || replace(NEW.id::text, '-', '');

  IF NEW.parent_message_id IS NOT NULL THEN
    SELECT *
      INTO parent_row
    FROM public.messages
    WHERE id = NEW.parent_message_id
      AND conversation_id = NEW.conversation_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Parent message % not found for conversation %', NEW.parent_message_id, NEW.conversation_id;
    END IF;

    NEW.depth := LEAST(parent_row.depth + 1, 32767)::smallint;
    NEW.thread_root_id := COALESCE(parent_row.thread_root_id, parent_row.id);
    NEW.sort_key := parent_row.sort_key || '.' || segment;

    IF NEW.round_id IS NULL THEN
      NEW.round_id := COALESCE(
        parent_row.round_id,
        CASE WHEN parent_row.role = 'user' THEN parent_row.id ELSE NULL END
      );
    END IF;
  ELSE
    NEW.depth := 0;
    NEW.thread_root_id := COALESCE(NEW.thread_root_id, NEW.id);
    NEW.sort_key := segment;

    IF NEW.round_id IS NULL AND NEW.role = 'user' THEN
      NEW.round_id := NEW.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_message_thread_fields_trigger ON public.messages;
CREATE TRIGGER set_message_thread_fields_trigger
  BEFORE INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.set_message_thread_fields();

-- Backfill round_id for historical user messages.
UPDATE public.messages
SET round_id = id
WHERE role = 'user'
  AND round_id IS NULL;

-- Backfill round_id/parent_message_id for non-user messages by attaching to the most recent user turn.
WITH assistant_rounds AS (
  SELECT
    m.id,
    u.id AS resolved_round_id
  FROM public.messages m
  LEFT JOIN LATERAL (
    SELECT id
    FROM public.messages u
    WHERE u.conversation_id = m.conversation_id
      AND u.role = 'user'
      AND (
        u.created_at < m.created_at
        OR (u.created_at = m.created_at AND u.id::text <= m.id::text)
      )
    ORDER BY u.created_at DESC, u.id DESC
    LIMIT 1
  ) u ON TRUE
  WHERE m.role <> 'user'
)
UPDATE public.messages m
SET
  round_id = COALESCE(m.round_id, assistant_rounds.resolved_round_id),
  parent_message_id = COALESCE(m.parent_message_id, assistant_rounds.resolved_round_id)
FROM assistant_rounds
WHERE m.id = assistant_rounds.id
  AND assistant_rounds.resolved_round_id IS NOT NULL;

-- Compute deterministic thread_root_id, depth, and sort_key for all existing messages.
WITH RECURSIVE threaded AS (
  SELECT
    m.id,
    m.parent_message_id,
    0::smallint AS calc_depth,
    m.id AS calc_root_id,
    to_char(timezone('utc', m.created_at), 'YYYYMMDDHH24MISSMS')
      || '-'
      || replace(m.id::text, '-', '') AS calc_sort_key
  FROM public.messages m
  WHERE m.parent_message_id IS NULL

  UNION ALL

  SELECT
    c.id,
    c.parent_message_id,
    LEAST(threaded.calc_depth + 1, 32767)::smallint AS calc_depth,
    threaded.calc_root_id,
    threaded.calc_sort_key
      || '.'
      || to_char(timezone('utc', c.created_at), 'YYYYMMDDHH24MISSMS')
      || '-'
      || replace(c.id::text, '-', '') AS calc_sort_key
  FROM public.messages c
  INNER JOIN threaded ON c.parent_message_id = threaded.id
)
UPDATE public.messages m
SET
  depth = threaded.calc_depth,
  thread_root_id = threaded.calc_root_id,
  sort_key = threaded.calc_sort_key
FROM threaded
WHERE threaded.id = m.id;

-- Fallback for any orphaned rows that were not reached in the recursive traversal.
UPDATE public.messages m
SET
  depth = 0,
  thread_root_id = m.id,
  sort_key = to_char(timezone('utc', m.created_at), 'YYYYMMDDHH24MISSMS')
    || '-'
    || replace(m.id::text, '-', '')
WHERE m.thread_root_id IS NULL
   OR m.sort_key = '';

CREATE INDEX IF NOT EXISTS idx_messages_conversation_created_asc
  ON public.messages(conversation_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_messages_thread_root_sort
  ON public.messages(thread_root_id, sort_key);

CREATE INDEX IF NOT EXISTS idx_messages_parent_created
  ON public.messages(parent_message_id, created_at);

CREATE INDEX IF NOT EXISTS idx_messages_round_created
  ON public.messages(round_id, created_at);

CREATE INDEX IF NOT EXISTS idx_messages_thread_root_score
  ON public.messages(thread_root_id, score DESC, created_at DESC);
