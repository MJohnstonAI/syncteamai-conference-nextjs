-- Revert default role onboarding logic without mutating historic migrations.
-- Clerk manages identity (text identifiers), so this function only provisions
-- a pending role; billing flows must perform any escalation.

-- Ensure profiles table can retain an email hint for future auditing.
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS email TEXT;

DROP FUNCTION IF EXISTS public.ensure_profile_and_role(TEXT);
DROP FUNCTION IF EXISTS public.ensure_profile_and_role(UUID);

CREATE OR REPLACE FUNCTION public.ensure_profile_and_role(
  _user_id TEXT,
  _email TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(_user_id, '') = '' THEN
    RAISE EXCEPTION 'user id required';
  END IF;
  IF _user_id <> auth.uid()::text THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  INSERT INTO public.profiles (id, email)
  VALUES (_user_id, _email)
  ON CONFLICT (id) DO UPDATE
    SET email = COALESCE(EXCLUDED.email, public.profiles.email);

  INSERT INTO public.user_roles (user_id, role)
  VALUES (_user_id, 'pending')
  ON CONFLICT (user_id) DO NOTHING;
END;
$$;

COMMENT ON FUNCTION public.ensure_profile_and_role(TEXT, TEXT)
  IS 'Creates profile and default pending role; billing/webhooks must elevate to paid/admin.';
