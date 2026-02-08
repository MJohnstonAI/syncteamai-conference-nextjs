# User Roles Security Refactor

## Overview
Migrate from storing user roles in the `profiles.tier` column to a dedicated `user_roles` table with proper security definer functions. This eliminates privilege escalation risks and follows Supabase security best practices.

## Current Security Debt

### Problems with Current Implementation
1. **Privilege Escalation Risk**: Roles stored in `profiles` table can potentially be manipulated
2. **RLS Recursion**: Direct queries to `profiles` in RLS policies cause infinite recursion
3. **Lack of Audit Trail**: No record of role changes
4. **No Multi-Role Support**: Users limited to single role
5. **Client-Side Role Checks**: `useUserProfile` hook reads `tier` directly, which is insecure

### Current Implementation
```typescript
// ❌ CURRENT - Insecure
export function useUserProfile() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["profile", user?.id],
    queryFn: async () => {
      if (!user) return null;

      // TEMPORARY ALPHA: Grant admin access to marcaj777@gmail.com
      if (user.email === "marcaj777@gmail.com") {
        return {
          id: user.id,
          tier: "admin" as UserTier,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (error) throw error;
      return data as UserProfile;
    },
    enabled: !!user,
  });
}
```

## Target Architecture

### Database Schema

#### 1. Create Role Enum
```sql
-- Keep existing app_role enum or create if not exists
CREATE TYPE public.app_role AS ENUM ('free', 'paid', 'admin', 'moderator');
```

#### 2. Create User Roles Table
```sql
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  granted_by UUID REFERENCES auth.users(id), -- Admin who granted this role
  granted_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ, -- NULL = never expires
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, role)
);

-- Indexes for performance
CREATE INDEX idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX idx_user_roles_role ON user_roles(role);
CREATE INDEX idx_user_roles_expires ON user_roles(expires_at) WHERE expires_at IS NOT NULL;

-- Enable RLS
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
```

#### 3. Create Security Definer Function
```sql
-- Function to check if user has a specific role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
      AND (expires_at IS NULL OR expires_at > NOW())
  );
$$;

-- Function to get user's highest role
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID)
RETURNS public.app_role
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role
  FROM public.user_roles
  WHERE user_id = _user_id
    AND (expires_at IS NULL OR expires_at > NOW())
  ORDER BY 
    CASE role
      WHEN 'admin' THEN 4
      WHEN 'moderator' THEN 3
      WHEN 'paid' THEN 2
      WHEN 'free' THEN 1
    END DESC
  LIMIT 1;
$$;

-- Function to check if user is paid or admin
CREATE OR REPLACE FUNCTION public.is_paid_or_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('paid', 'admin', 'moderator')
      AND (expires_at IS NULL OR expires_at > NOW())
  );
$$;

-- Function to check if user is admin
CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = 'admin'
      AND (expires_at IS NULL OR expires_at > NOW())
  );
$$;
```

#### 4. RLS Policies for user_roles Table
```sql
-- Users can view their own roles
CREATE POLICY "Users can view their own roles"
  ON user_roles FOR SELECT
  USING (auth.uid() = user_id);

-- Admins can view all roles
CREATE POLICY "Admins can view all roles"
  ON user_roles FOR SELECT
  USING (public.is_admin(auth.uid()));

-- Admins can grant/revoke roles
CREATE POLICY "Admins can insert roles"
  ON user_roles FOR INSERT
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update roles"
  ON user_roles FOR UPDATE
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete roles"
  ON user_roles FOR DELETE
  USING (public.is_admin(auth.uid()));
```

#### 5. Update Existing RLS Policies
```sql
-- Example: Update groups policies
DROP POLICY IF EXISTS "Paid users can create groups" ON groups;
CREATE POLICY "Paid users can create groups"
  ON groups FOR INSERT
  WITH CHECK (
    auth.uid() = owner_id 
    AND public.is_paid_or_admin(auth.uid()) 
    AND is_preset = false
  );

-- Example: Update saved_prompts policies
DROP POLICY IF EXISTS "Paid users can create prompts" ON saved_prompts;
CREATE POLICY "Paid users can create prompts"
  ON saved_prompts FOR INSERT
  WITH CHECK (
    auth.uid() = owner_id 
    AND public.is_paid_or_admin(auth.uid()) 
    AND is_demo = false
  );
```

#### 6. Create Trigger for New Users
```sql
-- Update handle_new_user function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Still create profile for other user data
  INSERT INTO public.profiles (id)
  VALUES (NEW.id);
  
  -- Grant free role by default
  INSERT INTO public.user_roles (user_id, role, granted_by)
  VALUES (NEW.id, 'free', NEW.id);
  
  RETURN NEW;
END;
$$;

-- Trigger still exists:
-- CREATE TRIGGER on_auth_user_created
--   AFTER INSERT ON auth.users
--   FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

### Data Migration

#### Backfill Existing Users
```sql
-- Insert roles based on existing profiles.tier
INSERT INTO public.user_roles (user_id, role, granted_by, notes)
SELECT 
  id,
  tier::public.app_role,
  id, -- Self-granted for migration
  'Migrated from profiles.tier'
FROM public.profiles
ON CONFLICT (user_id, role) DO NOTHING;

-- Verify migration
SELECT 
  p.id,
  p.tier as old_tier,
  ur.role as new_role,
  ur.granted_at
FROM profiles p
LEFT JOIN user_roles ur ON ur.user_id = p.id
ORDER BY p.created_at DESC;
```

#### Remove tier Column (After Verification)
```sql
-- DO THIS ONLY AFTER CONFIRMING EVERYTHING WORKS
-- Wait at least 1-2 weeks in production

-- Remove column
ALTER TABLE public.profiles DROP COLUMN IF EXISTS tier;
```

## Frontend Implementation

### Update Type Definitions
```typescript
// src/types/user.ts
export type UserRole = "free" | "paid" | "admin" | "moderator";

export interface UserRoleRecord {
  id: string;
  user_id: string;
  role: UserRole;
  granted_by: string | null;
  granted_at: string;
  expires_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserProfile {
  id: string;
  created_at: string;
  updated_at: string;
  // tier removed - now fetch from user_roles
}
```

### Update useUserProfile Hook
```typescript
// src/hooks/useUserProfile.tsx
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import type { UserRole } from "@/types/user";

export function useUserProfile() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["profile", user?.id],
    queryFn: async () => {
      if (!user) return null;

      // Fetch profile data
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (profileError) throw profileError;

      // Fetch user role via edge function (never trust client-side)
      const { data: roleData, error: roleError } = await supabase.functions.invoke(
        "get-user-role",
        { body: {} }
      );

      if (roleError) throw roleError;

      return {
        ...profile,
        role: roleData.role as UserRole,
        roles: roleData.roles as UserRole[], // All active roles
      };
    },
    enabled: !!user,
    staleTime: 60000, // Cache for 1 minute
  });
}
```

### Create useUserRoles Hook
```typescript
// src/hooks/useUserRoles.tsx
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export function useUserRoles() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["user_roles", user?.id],
    queryFn: async () => {
      if (!user) return [];

      const { data, error } = await supabase
        .from("user_roles")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });
}

// Helper hooks
export function useIsAdmin() {
  const { data: profile } = useUserProfile();
  return profile?.role === "admin";
}

export function useIsPaidOrAdmin() {
  const { data: profile } = useUserProfile();
  return profile?.role && ["paid", "admin", "moderator"].includes(profile.role);
}
```

### Edge Function for Role Verification

Create `supabase/functions/get-user-role/index.ts`:

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get authenticated user from JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      throw new Error("Unauthorized");
    }

    // Use security definer function to get role
    const { data, error } = await supabase.rpc("get_user_role", {
      _user_id: user.id,
    });

    if (error) throw error;

    // Get all active roles
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .or("expires_at.is.null,expires_at.gt.now()");

    return new Response(
      JSON.stringify({
        role: data, // Primary role
        roles: roles?.map((r) => r.role) || [], // All roles
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
```

### Update Edge Function Configuration

Add to `supabase/config.toml`:

```toml
[functions.get-user-role]
verify_jwt = true
```

## Admin UI for Role Management

### Role Management Page
```typescript
// src/pages/admin/RoleManagement.tsx
- List all users with their current roles
- Search/filter users
- Grant/revoke roles with expiration dates
- Add notes for audit trail
- View role change history
```

### Role Assignment Dialog
```typescript
// src/components/admin/RoleAssignmentDialog.tsx
- Select user (autocomplete)
- Select role(s) to grant
- Optional expiration date
- Notes field
- Confirmation
```

## Testing Checklist

### Security Tests
- [ ] Non-admin cannot query user_roles for other users
- [ ] Non-admin cannot insert/update/delete roles
- [ ] Security definer functions work correctly
- [ ] RLS policies prevent privilege escalation
- [ ] Edge function properly validates JWT
- [ ] Client cannot manipulate role data

### Functionality Tests
- [ ] New users get 'free' role automatically
- [ ] Admin can grant/revoke roles
- [ ] Expired roles are ignored
- [ ] Multi-role support works
- [ ] Role hierarchy respected
- [ ] Profile queries work without tier column

### Migration Tests
- [ ] All existing users migrated correctly
- [ ] No users lost their roles
- [ ] Old tier values match new roles
- [ ] No duplicate role assignments

## Implementation Phases

### Phase 1: Database Setup (CRITICAL - Do First)
1. Create user_roles table
2. Create security definer functions
3. Add RLS policies
4. DO NOT drop profiles.tier yet

### Phase 2: Data Migration
1. Backfill user_roles from profiles.tier
2. Verify all users have roles
3. Run parallel for 1-2 weeks

### Phase 3: Backend Updates
1. Create get-user-role edge function
2. Update RLS policies to use has_role()
3. Test all policies thoroughly

### Phase 4: Frontend Updates
1. Update useUserProfile hook
2. Create useUserRoles hook
3. Update all components using tier
4. Test all user flows

### Phase 5: Admin Features
1. Build role management UI
2. Add role assignment dialog
3. Add audit log viewer

### Phase 6: Cleanup (After 2+ Weeks)
1. Verify no issues reported
2. Drop profiles.tier column
3. Remove migration notes
4. Update documentation

## Rollback Plan

If issues occur:

```sql
-- Restore tier column
ALTER TABLE public.profiles ADD COLUMN tier public.app_role;

-- Backfill from user_roles
UPDATE public.profiles p
SET tier = (
  SELECT role FROM user_roles 
  WHERE user_id = p.id 
  ORDER BY 
    CASE role
      WHEN 'admin' THEN 4
      WHEN 'paid' THEN 2
      WHEN 'free' THEN 1
    END DESC
  LIMIT 1
);

-- Revert RLS policies to use profiles.tier
-- Revert frontend to use old useUserProfile
```

## Security Best Practices

1. **Never trust client-side role checks**
2. **Always use security definer functions in RLS**
3. **Validate roles in edge functions**
4. **Audit all role changes**
5. **Use expiration dates for temporary access**
6. **Never expose role management to non-admins**
7. **Test RLS policies with different user roles**
8. **Monitor for privilege escalation attempts**

## Documentation Updates Needed

- Update README with new role system
- Update API documentation
- Add security documentation
- Create admin guide for role management
- Update onboarding documentation
