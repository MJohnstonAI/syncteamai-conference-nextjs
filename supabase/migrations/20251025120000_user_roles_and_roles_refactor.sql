-- Migration: Introduce user_roles and refactor roles model
-- - Add new table public.user_roles
-- - Remove tier from public.profiles
-- - Replace old functions with user_roles backed versions
-- - Update RLS policies to use can_access_paid_features()

-- 1) Ensure enum contains required values. We will keep 'free' if it exists
--    to avoid dangerous enum value drops; it will be unused.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'app_role'
  ) THEN
    BEGIN
      ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'pending';
    EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN
      ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'cancelled';
    EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN
      ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'paid';
    EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN
      ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'admin';
    EXCEPTION WHEN duplicate_object THEN NULL; END;
  ELSE
    CREATE TYPE public.app_role AS ENUM ('pending','paid','cancelled','admin');
  END IF;
END$$;

-- 2) Create user_roles table
CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  subscription_started_at TIMESTAMPTZ,
  subscription_cancelled_at TIMESTAMPTZ,
  cancellation_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_roles_unique_user UNIQUE (user_id)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own role" ON public.user_roles;
CREATE POLICY "Users can view their own role"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can update user roles" ON public.user_roles;
CREATE POLICY "Admins can update user roles"
  ON public.user_roles FOR UPDATE
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can delete user roles" ON public.user_roles;
CREATE POLICY "Admins can delete user roles"
  ON public.user_roles FOR DELETE
  USING (public.is_admin(auth.uid()));

DROP FUNCTION IF EXISTS public.get_user_tier(UUID);
DROP FUNCTION IF EXISTS public.is_paid_or_admin(UUID);
DROP FUNCTION IF EXISTS public.is_admin(UUID);

CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID)
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

CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
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

CREATE OR REPLACE FUNCTION public.can_access_paid_features(_user_id UUID)
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

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id) VALUES (NEW.id);
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'pending')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'tier'
  ) THEN
    ALTER TABLE public.profiles DROP COLUMN tier;
  END IF;
END$$;

DROP POLICY IF EXISTS "Paid users can create groups" ON public.groups;
CREATE POLICY "Paid users can create groups"
  ON public.groups FOR INSERT
  WITH CHECK (
    auth.uid() = owner_id
    AND public.can_access_paid_features(auth.uid())
    AND is_preset = false
  );

DROP POLICY IF EXISTS "Paid users can create prompts" ON public.saved_prompts;
CREATE POLICY "Paid users can create prompts"
  ON public.saved_prompts FOR INSERT
  WITH CHECK (
    auth.uid() = owner_id
    AND public.can_access_paid_features(auth.uid())
    AND is_demo = false
  );

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_user_roles_updated_at ON public.user_roles;
CREATE TRIGGER set_user_roles_updated_at
  BEFORE UPDATE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
