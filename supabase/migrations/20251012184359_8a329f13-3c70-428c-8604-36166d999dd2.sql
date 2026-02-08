-- Create app_role enum for user tiers
CREATE TYPE public.app_role AS ENUM ('free', 'paid', 'admin');

-- Create profiles table (maps to UserAccountShadow)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tier app_role NOT NULL DEFAULT 'free',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Create groups table
CREATE TABLE public.groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  is_preset BOOLEAN NOT NULL DEFAULT false,
  owner_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;

-- Create saved_prompts table
CREATE TABLE public.saved_prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  script TEXT NOT NULL,
  owner_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  group_id UUID REFERENCES public.groups(id) ON DELETE SET NULL,
  is_demo BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.saved_prompts ENABLE ROW LEVEL SECURITY;

-- Create indexes for performance
CREATE INDEX idx_groups_owner ON public.groups(owner_id);
CREATE INDEX idx_groups_preset ON public.groups(is_preset);
CREATE INDEX idx_prompts_owner ON public.saved_prompts(owner_id);
CREATE INDEX idx_prompts_group ON public.saved_prompts(group_id);
CREATE INDEX idx_prompts_demo ON public.saved_prompts(is_demo);

-- Create security definer function to check user tier
CREATE OR REPLACE FUNCTION public.get_user_tier(_user_id UUID)
RETURNS app_role
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tier FROM public.profiles WHERE id = _user_id;
$$;

-- Create security definer function to check if user is admin
CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = _user_id AND tier = 'admin'
  );
$$;

-- Create security definer function to check if user is paid or admin
CREATE OR REPLACE FUNCTION public.is_paid_or_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = _user_id AND tier IN ('paid', 'admin')
  );
$$;

-- RLS Policies for profiles
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- RLS Policies for groups
CREATE POLICY "Everyone can view preset groups"
  ON public.groups FOR SELECT
  USING (is_preset = true);

CREATE POLICY "Users can view their own groups"
  ON public.groups FOR SELECT
  USING (auth.uid() = owner_id);

CREATE POLICY "Paid users can create groups"
  ON public.groups FOR INSERT
  WITH CHECK (
    auth.uid() = owner_id 
    AND public.is_paid_or_admin(auth.uid())
    AND is_preset = false
  );

CREATE POLICY "Users can update their own groups"
  ON public.groups FOR UPDATE
  USING (auth.uid() = owner_id AND is_preset = false);

CREATE POLICY "Users can delete their own groups"
  ON public.groups FOR DELETE
  USING (auth.uid() = owner_id AND is_preset = false);

CREATE POLICY "Admins can manage preset groups"
  ON public.groups FOR ALL
  USING (public.is_admin(auth.uid()) AND is_preset = true);

-- RLS Policies for saved_prompts
CREATE POLICY "Everyone can view demo prompts"
  ON public.saved_prompts FOR SELECT
  USING (is_demo = true);

CREATE POLICY "Everyone can view prompts in preset groups"
  ON public.saved_prompts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.groups 
      WHERE groups.id = saved_prompts.group_id 
      AND groups.is_preset = true
    )
  );

CREATE POLICY "Users can view their own prompts"
  ON public.saved_prompts FOR SELECT
  USING (auth.uid() = owner_id);

CREATE POLICY "Paid users can create prompts"
  ON public.saved_prompts FOR INSERT
  WITH CHECK (
    auth.uid() = owner_id 
    AND public.is_paid_or_admin(auth.uid())
    AND is_demo = false
  );

CREATE POLICY "Users can update their own prompts"
  ON public.saved_prompts FOR UPDATE
  USING (auth.uid() = owner_id AND is_demo = false);

CREATE POLICY "Users can delete their own prompts"
  ON public.saved_prompts FOR DELETE
  USING (auth.uid() = owner_id AND is_demo = false);

CREATE POLICY "Admins can manage demo prompts"
  ON public.saved_prompts FOR ALL
  USING (public.is_admin(auth.uid()) AND is_demo = true);

-- Create trigger function for updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Create triggers for updated_at
CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_groups_updated_at
  BEFORE UPDATE ON public.groups
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_prompts_updated_at
  BEFORE UPDATE ON public.saved_prompts
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Create trigger function to auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, tier)
  VALUES (NEW.id, 'free');
  RETURN NEW;
END;
$$;

-- Create trigger for auto-creating profiles
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Insert default preset groups
INSERT INTO public.groups (name, is_preset) VALUES
  ('Demo', true),
  ('Art & Design', true),
  ('Business & Strategy', true),
  ('Creative Writing', true),
  ('Education', true),
  ('Finance', true),
  ('Food', true),
  ('General & Uncategorized', true),
  ('Health', true),
  ('Marketing', true),
  ('Music', true),
  ('News', true),
  ('Software Dev', true),
  ('Tech & Science', true);