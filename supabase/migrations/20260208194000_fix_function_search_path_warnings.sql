-- Harden function execution context for Supabase linter warning:
-- function_search_path_mutable.
--
-- This migration updates all overloads of the flagged functions if present.

DO $$
DECLARE
  fn RECORD;
BEGIN
  FOR fn IN
    SELECT
      n.nspname AS schema_name,
      p.proname AS function_name,
      pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'handle_updated_at',
        'get_user_uuid_from_clerk',
        'set_updated_at',
        'is_paid_subscriber',
        'get_user_access'
      )
  LOOP
    EXECUTE format(
      'ALTER FUNCTION %I.%I(%s) SET search_path = public, pg_temp',
      fn.schema_name,
      fn.function_name,
      fn.args
    );
  END LOOP;
END
$$;

