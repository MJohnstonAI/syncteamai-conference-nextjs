-- Migrate auth-related IDs from UUID -> TEXT to support Clerk IDs

-- 0) Pre-drop policies that depend on uuid-typed functions/columns
DROP POLICY IF EXISTS "Admins can update user roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can delete user roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can view their own role" ON public.user_roles;
DROP POLICY IF EXISTS "Paid users can create groups" ON public.groups;
DROP POLICY IF EXISTS "Paid users can create prompts" ON public.saved_prompts;

-- 1) Drop foreign keys tied to auth.users and profiles
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;
ALTER TABLE public.groups DROP CONSTRAINT IF EXISTS groups_owner_id_fkey;
ALTER TABLE public.saved_prompts DROP CONSTRAINT IF EXISTS saved_prompts_owner_id_fkey;

-- 2) Alter columns to TEXT
ALTER TABLE public.profiles ALTER COLUMN id TYPE TEXT USING id::text;
ALTER TABLE public.user_roles ALTER COLUMN user_id TYPE TEXT USING user_id::text;
ALTER TABLE public.groups ALTER COLUMN owner_id TYPE TEXT USING owner_id::text;
ALTER TABLE public.saved_prompts ALTER COLUMN owner_id TYPE TEXT USING owner_id::text;
-- Optional: conversations/messages if present with uuid types
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='conversations' AND column_name='user_id'
  ) THEN
    BEGIN
      ALTER TABLE public.conversations ALTER COLUMN user_id TYPE TEXT USING user_id::text;
    EXCEPTION WHEN undefined_column THEN NULL; END;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='messages' AND column_name='user_id'
  ) THEN
    BEGIN
      ALTER TABLE public.messages ALTER COLUMN user_id TYPE TEXT USING user_id::text;
    EXCEPTION WHEN undefined_column THEN NULL; END;
  END IF;
END$$;

-- 3) Update helper functions to TEXT
DROP FUNCTION IF EXISTS public.get_user_role(uuid);
DROP FUNCTION IF EXISTS public.is_admin(uuid);
DROP FUNCTION IF EXISTS public.can_access_paid_features(uuid);

CREATE OR REPLACE FUNCTION public.get_user_role(_user_id TEXT)
RETURNS public.app_role
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ur.role
  FROM public.user_roles ur
  WHERE ur.user_id = _user_id
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.can_access_paid_features(_user_id TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('paid','admin')
  );
$$;

-- 4) Remove Supabase-auth trigger (no longer used with Clerk)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- 5) Create RPC to provision profile + role for Clerk users
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
  VALUES (_user_id, 'pending')
  ON CONFLICT (user_id) DO NOTHING;
END;
$$;

-- 6) Recreate RLS policies with TEXT-aware comparisons and TEXT-typed functions

-- user_roles
CREATE POLICY "Users can view their own role"
  ON public.user_roles FOR SELECT
  USING (auth.uid()::text = user_id);

CREATE POLICY "Admins can update user roles"
  ON public.user_roles FOR UPDATE
  USING (public.is_admin(auth.uid()::text))
  WITH CHECK (public.is_admin(auth.uid()::text));

CREATE POLICY "Admins can delete user roles"
  ON public.user_roles FOR DELETE
  USING (public.is_admin(auth.uid()::text));

-- groups
CREATE POLICY "Paid users can create groups"
  ON public.groups FOR INSERT
  WITH CHECK (
    auth.uid()::text = owner_id
    AND public.can_access_paid_features(auth.uid()::text)
    AND is_preset = false
  );

-- saved_prompts
CREATE POLICY "Paid users can create prompts"
  ON public.saved_prompts FOR INSERT
  WITH CHECK (
    auth.uid()::text = owner_id
    AND public.can_access_paid_features(auth.uid()::text)
    AND is_demo = false
  );
