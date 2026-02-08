-- Ensure Clerk sign-ins default to paid subscription role
CREATE OR REPLACE FUNCTION public.ensure_profile_and_role(_user_id TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _user_id IS NULL OR _user_id = '' THEN
    RAISE EXCEPTION 'user id required';
  END IF;
  IF _user_id <> auth.uid()::text THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  INSERT INTO public.profiles (id)
  VALUES (_user_id)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (_user_id, 'paid')
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;
END;
$;
