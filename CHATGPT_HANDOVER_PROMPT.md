# ChatGPT Handover Prompt: Database Schema & Index Creation for SyncTeamAI

## 🎯 Your Mission
You are being brought in to complete **ONLY** the PostgreSQL database tables and indexes for the **Council of Experts** and **Role-Based Access Control (RBAC)** system for SyncTeamAI.

**⚠️ CRITICAL CONSTRAINTS:**
- **DO NOT** touch any existing code files (React, TypeScript, hooks, components, pages)
- **DO NOT** modify the UI/UX
- **DO NOT** create edge functions or authentication flows
- **ONLY** create SQL migration scripts for database tables, indexes, RLS policies, and security definer functions

---

## 📋 Project Context

**SyncTeamAI** is a multi-agent AI collaboration platform where:
- A human "Chairman" orchestrates AI agents in conference-room-style sessions
- Agents have specialized roles (Strategy, Creative, Analyst, etc.)
- Users create conversations and templates
- The system needs proper role-based access control (admin, paid, free tiers)

**Current Database Schema:**
- `public.profiles` (id, tier, created_at, updated_at) - **DEPRECATED tier field**
- `public.conversations` (id, user_id, title, script, created_at, updated_at)
- `public.messages` (id, conversation_id, user_id, role, content, avatar_id, created_at)
- `public.groups` (id, name, owner_id, is_preset, created_at, updated_at)
- `public.saved_prompts` (id, title, description, script, group_id, owner_id, is_demo, created_at, updated_at)

**Existing Supabase Functions:**
- `handle_new_user()` - Creates profile on user signup
- `handle_updated_at()` - Auto-updates timestamps
- `set_message_user_id()` - Sets user_id on messages
- `is_admin(_user_id uuid)` - Checks if user is admin (DEPRECATED - uses profiles.tier)
- `is_paid_or_admin(_user_id uuid)` - Checks if user is paid or admin (DEPRECATED - uses profiles.tier)
- `get_user_tier(_user_id uuid)` - Returns user tier (DEPRECATED - uses profiles.tier)

---

## 🚨 Security Debt to Fix

**CRITICAL:** The current system incorrectly stores roles in `profiles.tier`, which is insecure and violates security best practices. Your job is to implement proper RBAC using a dedicated `user_roles` table.

### Why This Matters:
1. **Privilege Escalation Risk:** Storing roles in profiles allows client-side manipulation
2. **Audit Trail:** No history of role changes
3. **Flexibility:** Can't assign multiple roles to a single user
4. **RLS Performance:** Checking profiles in RLS causes recursive policy issues

---

## 🎯 Your Deliverable: SQL Migration Script

Create a **single, comprehensive SQL migration file** that includes:

### 1. Create `user_roles` Table
```sql
-- Create enum for roles (if not exists)
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('free', 'paid', 'admin');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create user_roles table
CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  UNIQUE (user_id, role)
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON public.user_roles(role);
CREATE INDEX IF NOT EXISTS idx_user_roles_user_role ON public.user_roles(user_id, role);

-- Enable RLS
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view their own roles
CREATE POLICY "Users can view their own roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- RLS Policy: Admins can manage all roles (using has_role function below)
-- NOTE: This policy will be created AFTER the has_role function is created
```

### 2. Create Security Definer Functions
```sql
-- Function: Check if user has a specific role
-- SECURITY DEFINER allows bypassing RLS to prevent infinite recursion
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
$$;

-- Function: Check if user is admin
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'admin'::app_role);
$$;

-- Function: Check if user is paid or admin
CREATE OR REPLACE FUNCTION public.is_paid_or_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'admin'::app_role) 
      OR public.has_role(_user_id, 'paid'::app_role);
$$;

-- Function: Get user roles (returns array of roles)
CREATE OR REPLACE FUNCTION public.get_user_roles(_user_id uuid)
RETURNS app_role[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ARRAY_AGG(role)
  FROM public.user_roles
  WHERE user_id = _user_id;
$$;

-- Now create the admin policy for user_roles
CREATE POLICY "Admins can manage all roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()));
```

### 3. Backfill Existing Users
```sql
-- Migrate existing profiles.tier to user_roles
-- This is a one-time data migration
INSERT INTO public.user_roles (user_id, role)
SELECT id, tier
FROM public.profiles
WHERE tier IS NOT NULL
ON CONFLICT (user_id, role) DO NOTHING;

-- Grant admin role to the project owner
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::app_role
FROM auth.users
WHERE email = 'marcaj777@gmail.com'
ON CONFLICT (user_id, role) DO UPDATE SET role = 'admin'::app_role;
```

### 4. Update Existing RLS Policies
```sql
-- conversations table: Update admin policies
DROP POLICY IF EXISTS "Admins can view all conversations" ON public.conversations;
CREATE POLICY "Admins can view all conversations"
ON public.conversations
FOR SELECT
TO authenticated
USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can update all conversations" ON public.conversations;
CREATE POLICY "Admins can update all conversations"
ON public.conversations
FOR UPDATE
TO authenticated
USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can delete all conversations" ON public.conversations;
CREATE POLICY "Admins can delete all conversations"
ON public.conversations
FOR DELETE
TO authenticated
USING (public.is_admin(auth.uid()));

-- messages table: Update admin policies
DROP POLICY IF EXISTS "Admins can view all messages" ON public.messages;
CREATE POLICY "Admins can view all messages"
ON public.messages
FOR SELECT
TO authenticated
USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can create all messages" ON public.messages;
CREATE POLICY "Admins can create all messages"
ON public.messages
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can delete all messages" ON public.messages;
CREATE POLICY "Admins can delete all messages"
ON public.messages
FOR DELETE
TO authenticated
USING (public.is_admin(auth.uid()));

-- groups table: Update admin policies
DROP POLICY IF EXISTS "Admins can manage preset groups" ON public.groups;
CREATE POLICY "Admins can manage preset groups"
ON public.groups
FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()) AND is_preset = true);

-- groups table: Update paid user policies
DROP POLICY IF EXISTS "Paid users can create groups" ON public.groups;
CREATE POLICY "Paid users can create groups"
ON public.groups
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = owner_id 
  AND public.is_paid_or_admin(auth.uid()) 
  AND is_preset = false
);

-- saved_prompts table: Update admin policies
DROP POLICY IF EXISTS "Admins can manage demo prompts" ON public.saved_prompts;
CREATE POLICY "Admins can manage demo prompts"
ON public.saved_prompts
FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()) AND is_demo = true);

-- saved_prompts table: Update paid user policies
DROP POLICY IF EXISTS "Paid users can create prompts" ON public.saved_prompts;
CREATE POLICY "Paid users can create prompts"
ON public.saved_prompts
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = owner_id 
  AND public.is_paid_or_admin(auth.uid()) 
  AND is_demo = false
);
```

### 5. Add Performance Indexes
```sql
-- Conversations: Optimize for user queries
CREATE INDEX IF NOT EXISTS idx_conversations_user_id_created_at 
ON public.conversations(user_id, created_at DESC);

-- Messages: Optimize for conversation queries
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id_created_at 
ON public.messages(conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_user_id 
ON public.messages(user_id);

CREATE INDEX IF NOT EXISTS idx_messages_avatar_id 
ON public.messages(avatar_id);

-- Groups: Optimize for owner and preset queries
CREATE INDEX IF NOT EXISTS idx_groups_owner_id 
ON public.groups(owner_id);

CREATE INDEX IF NOT EXISTS idx_groups_is_preset 
ON public.groups(is_preset);

-- Saved Prompts: Optimize for group and owner queries
CREATE INDEX IF NOT EXISTS idx_saved_prompts_group_id_created_at 
ON public.saved_prompts(group_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_saved_prompts_owner_id_is_demo 
ON public.saved_prompts(owner_id, is_demo);

CREATE INDEX IF NOT EXISTS idx_saved_prompts_is_demo 
ON public.saved_prompts(is_demo);

-- Profiles: Optimize for user lookups (existing, but ensure)
CREATE INDEX IF NOT EXISTS idx_profiles_id 
ON public.profiles(id);
```

### 6. Trigger for Auto-Assigning Free Role
```sql
-- Update handle_new_user trigger to assign free role
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Create profile
  INSERT INTO public.profiles (id, tier)
  VALUES (NEW.id, 'free'::app_role);
  
  -- Assign free role to user_roles
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'free'::app_role);
  
  RETURN NEW;
END;
$$;
```

---

## 📊 Performance Targets

Your indexes should achieve:
- **User role check:** < 5ms (using has_role function)
- **Conversation list:** < 50ms for 1000 conversations
- **Message retrieval:** < 100ms for 500 messages
- **Template search:** < 50ms for 100 templates

---

## ✅ Acceptance Criteria

Your SQL migration is complete when:

1. ✅ `user_roles` table exists with proper schema
2. ✅ All 4 security definer functions work (has_role, is_admin, is_paid_or_admin, get_user_roles)
3. ✅ All existing RLS policies updated to use new functions
4. ✅ Existing users migrated from profiles.tier to user_roles
5. ✅ marcaj777@gmail.com has admin role assigned
6. ✅ All performance indexes created
7. ✅ New user trigger assigns free role automatically
8. ✅ RLS enabled on user_roles table with policies
9. ✅ No SQL errors when running the migration

---

## 🧪 Testing Your Migration

After running your migration, test with these queries:

```sql
-- Test 1: Check if admin user has role
SELECT public.is_admin((SELECT id FROM auth.users WHERE email = 'marcaj777@gmail.com'));
-- Expected: true

-- Test 2: Get all roles for admin user
SELECT public.get_user_roles((SELECT id FROM auth.users WHERE email = 'marcaj777@gmail.com'));
-- Expected: {admin}

-- Test 3: Check if function prevents infinite recursion
SELECT public.has_role('00000000-0000-0000-0000-000000000000'::uuid, 'admin'::app_role);
-- Expected: false (no error)

-- Test 4: Verify indexes exist
SELECT tablename, indexname 
FROM pg_indexes 
WHERE schemaname = 'public' 
AND indexname LIKE 'idx_%'
ORDER BY tablename, indexname;
-- Expected: All indexes listed above

-- Test 5: Verify RLS policies updated
SELECT tablename, policyname 
FROM pg_policies 
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
-- Expected: All policies using has_role/is_admin functions
```

---

## 🚫 What NOT to Do

**DO NOT:**
- ❌ Modify any `.tsx` or `.ts` files
- ❌ Change UI components
- ❌ Create edge functions
- ❌ Modify authentication flows
- ❌ Update the Supabase client configuration
- ❌ Touch React hooks or components
- ❌ Delete the profiles table or tier column (we may need it for rollback)
- ❌ Use `profiles.tier` in any new RLS policies
- ❌ Create policies that query the table they're attached to (causes infinite recursion)

**DO:**
- ✅ Create SQL migration scripts only
- ✅ Use SECURITY DEFINER for role-checking functions
- ✅ Create proper indexes for scale (hundreds of thousands of users)
- ✅ Update existing RLS policies to use new functions
- ✅ Test your SQL before delivering

---

## 📦 Deliverable Format

Provide your work as a **single SQL file** that can be run via Supabase migration tool:

```sql
-- Migration: Implement RBAC with user_roles table
-- Created: [DATE]
-- Author: ChatGPT
-- Purpose: Replace profiles.tier with proper role-based access control

-- Step 1: Create user_roles table
[YOUR CODE HERE]

-- Step 2: Create security definer functions
[YOUR CODE HERE]

-- Step 3: Backfill existing users
[YOUR CODE HERE]

-- Step 4: Update RLS policies
[YOUR CODE HERE]

-- Step 5: Add performance indexes
[YOUR CODE HERE]

-- Step 6: Update triggers
[YOUR CODE HERE]
```

---

## 🔒 Security Checklist

Before submitting, verify:
- [ ] `user_roles` table has RLS enabled
- [ ] Security definer functions use `SET search_path = public`
- [ ] Functions are marked `STABLE` (not `VOLATILE`)
- [ ] No policies query the table they're attached to
- [ ] Admin role assigned to marcaj777@gmail.com
- [ ] All sensitive operations require authentication
- [ ] No SQL injection vectors in function definitions

---

## 📞 Questions?

If you need clarification:
1. **Check existing schema** in the project context above
2. **Follow security best practices** for Supabase RLS
3. **Prioritize performance** - this needs to scale to 100k+ users
4. **Ask for confirmation** if you're unsure about a security decision

---

## 🎬 Ready? Begin!

Create the SQL migration script following all specifications above. Remember:
- **Database work ONLY**
- **No code file changes**
- **Security first**
- **Performance-optimized**
- **Test before delivering**

Good luck! 🚀
