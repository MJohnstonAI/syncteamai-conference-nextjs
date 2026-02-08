# Avatar Roles and Skills System

## Overview
Implement a comprehensive role and skill assignment system for AI avatars in SyncTeamAI conferences. Each avatar can have specific roles (e.g., "Technical Lead", "UX Designer") and skills (e.g., "Python", "React", "Database Design") that influence their behavior and expertise in conversations.

## Goals
- Enable dynamic avatar behavior based on assigned roles
- Allow skill-based routing of questions to appropriate avatars
- Provide context-aware responses based on avatar expertise
- Support both preset and custom role/skill combinations

## Database Schema

### New Tables

#### `avatar_roles`
```sql
CREATE TABLE public.avatar_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  system_prompt_template TEXT NOT NULL,
  is_preset BOOLEAN DEFAULT false,
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_avatar_roles_owner ON avatar_roles(owner_id);
CREATE INDEX idx_avatar_roles_preset ON avatar_roles(is_preset);

-- RLS Policies
ALTER TABLE public.avatar_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view preset roles"
  ON avatar_roles FOR SELECT
  USING (is_preset = true);

CREATE POLICY "Users can view their own roles"
  ON avatar_roles FOR SELECT
  USING (auth.uid() = owner_id);

CREATE POLICY "Users can create custom roles"
  ON avatar_roles FOR INSERT
  WITH CHECK (auth.uid() = owner_id AND is_preset = false);

CREATE POLICY "Users can update their own roles"
  ON avatar_roles FOR UPDATE
  USING (auth.uid() = owner_id AND is_preset = false);

CREATE POLICY "Admins can manage preset roles"
  ON avatar_roles FOR ALL
  USING (public.is_admin(auth.uid()) AND is_preset = true);
```

#### `avatar_skills`
```sql
CREATE TABLE public.avatar_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL, -- e.g., "Programming", "Design", "Business"
  description TEXT,
  prompt_enhancement TEXT, -- Additional context to add to system prompt
  is_preset BOOLEAN DEFAULT false,
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_avatar_skills_category ON avatar_skills(category);
CREATE INDEX idx_avatar_skills_owner ON avatar_skills(owner_id);
CREATE INDEX idx_avatar_skills_preset ON avatar_skills(is_preset);

-- RLS Policies (similar pattern to roles)
ALTER TABLE public.avatar_skills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view preset skills"
  ON avatar_skills FOR SELECT
  USING (is_preset = true);

CREATE POLICY "Users can view their own skills"
  ON avatar_skills FOR SELECT
  USING (auth.uid() = owner_id);

CREATE POLICY "Users can create custom skills"
  ON avatar_skills FOR INSERT
  WITH CHECK (auth.uid() = owner_id AND is_preset = false);
```

#### `conversation_avatar_config`
```sql
CREATE TABLE public.conversation_avatar_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  avatar_id TEXT NOT NULL, -- e.g., "claude", "chatgpt"
  role_id UUID REFERENCES avatar_roles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(conversation_id, avatar_id)
);

-- Indexes
CREATE INDEX idx_conv_avatar_config_conv ON conversation_avatar_config(conversation_id);
CREATE INDEX idx_conv_avatar_config_role ON conversation_avatar_config(role_id);

-- RLS Policies
ALTER TABLE public.conversation_avatar_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage configs in their conversations"
  ON conversation_avatar_config FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM conversations 
      WHERE id = conversation_id AND user_id = auth.uid()
    )
  );
```

#### `conversation_avatar_skills` (junction table)
```sql
CREATE TABLE public.conversation_avatar_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id UUID NOT NULL REFERENCES conversation_avatar_config(id) ON DELETE CASCADE,
  skill_id UUID NOT NULL REFERENCES avatar_skills(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(config_id, skill_id)
);

-- Indexes
CREATE INDEX idx_conv_avatar_skills_config ON conversation_avatar_skills(config_id);
CREATE INDEX idx_conv_avatar_skills_skill ON conversation_avatar_skills(skill_id);

-- RLS inherits from parent conversation_avatar_config
ALTER TABLE public.conversation_avatar_skills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage skills via config"
  ON conversation_avatar_skills FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM conversation_avatar_config cac
      JOIN conversations c ON c.id = cac.conversation_id
      WHERE cac.id = config_id AND c.user_id = auth.uid()
    )
  );
```

## Preset Roles (Seed Data)

```sql
-- Insert preset roles
INSERT INTO avatar_roles (name, description, system_prompt_template, is_preset) VALUES
('Technical Lead', 'Senior engineer focused on architecture and best practices', 
 'You are a Technical Lead with expertise in system architecture, code quality, and engineering best practices. Focus on scalability, maintainability, and technical excellence.', true),

('Full-Stack Developer', 'Experienced in both frontend and backend development',
 'You are a Full-Stack Developer skilled in React, Node.js, databases, and API design. Provide practical implementation advice and code examples.', true),

('UX/UI Designer', 'User experience and interface design specialist',
 'You are a UX/UI Designer focused on user-centered design, accessibility, and visual aesthetics. Provide design critiques and improvement suggestions.', true),

('Product Manager', 'Strategic product planning and roadmap expert',
 'You are a Product Manager focused on user needs, business value, and feature prioritization. Help define requirements and success metrics.', true),

('DevOps Engineer', 'Infrastructure and deployment specialist',
 'You are a DevOps Engineer expert in CI/CD, cloud infrastructure, monitoring, and deployment strategies. Focus on reliability and automation.', true),

('QA Engineer', 'Quality assurance and testing expert',
 'You are a QA Engineer specialized in test strategies, edge cases, and quality standards. Identify potential bugs and suggest testing approaches.', true),

('Security Analyst', 'Application security and best practices specialist',
 'You are a Security Analyst focused on identifying vulnerabilities, secure coding practices, and compliance requirements.', true),

('Data Analyst', 'Data modeling and analytics expert',
 'You are a Data Analyst skilled in database design, query optimization, and data-driven insights. Help with schema design and analytics.', true);
```

## Preset Skills (Seed Data)

```sql
-- Programming Languages
INSERT INTO avatar_skills (name, category, description, prompt_enhancement, is_preset) VALUES
('Python', 'Programming', 'Python development expertise', 
 'You have deep expertise in Python, including async/await, type hints, and popular frameworks like FastAPI and Django.', true),

('TypeScript', 'Programming', 'TypeScript and modern JavaScript', 
 'You are expert in TypeScript, React, and modern JavaScript patterns including hooks, async/await, and ES6+.', true),

('SQL', 'Programming', 'Database queries and optimization', 
 'You are skilled in SQL query writing, optimization, indexing strategies, and relational database design.', true),

('Go', 'Programming', 'Go programming language', 
 'You have expertise in Go, including concurrency patterns, interfaces, and building scalable services.', true);

-- Frameworks & Libraries
INSERT INTO avatar_skills (name, category, description, prompt_enhancement, is_preset) VALUES
('React', 'Framework', 'React.js and ecosystem', 
 'You are expert in React including hooks, context, performance optimization, and the React ecosystem.', true),

('Node.js', 'Framework', 'Backend JavaScript runtime', 
 'You are skilled in Node.js, Express, async patterns, and building scalable backend services.', true),

('Supabase', 'Framework', 'Supabase backend platform', 
 'You have deep knowledge of Supabase including Auth, Database, RLS policies, Edge Functions, and Storage.', true);

-- Design Skills
INSERT INTO avatar_skills (name, category, description, prompt_enhancement, is_preset) VALUES
('UI Design', 'Design', 'User interface design', 
 'You excel at creating beautiful, intuitive interfaces with attention to typography, color, spacing, and visual hierarchy.', true),

('UX Research', 'Design', 'User experience research', 
 'You are skilled in user research methods, usability testing, personas, and user journey mapping.', true),

('Accessibility', 'Design', 'WCAG compliance and a11y', 
 'You are expert in web accessibility standards (WCAG 2.1 AA), screen readers, keyboard navigation, and inclusive design.', true);

-- Cloud & Infrastructure
INSERT INTO avatar_skills (name, category, description, prompt_enhancement, is_preset) VALUES
('AWS', 'Cloud', 'Amazon Web Services', 
 'You have expertise in AWS services including EC2, Lambda, S3, RDS, and infrastructure as code.', true),

('Docker', 'DevOps', 'Containerization', 
 'You are skilled in Docker, container orchestration, multi-stage builds, and Docker Compose.', true),

('CI/CD', 'DevOps', 'Continuous Integration/Deployment', 
 'You are expert in CI/CD pipelines, GitHub Actions, deployment strategies, and automated testing.', true);
```

## Frontend Implementation

### New React Hooks

#### `useAvatarRoles.tsx`
```typescript
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export interface AvatarRole {
  id: string;
  name: string;
  description: string | null;
  system_prompt_template: string;
  is_preset: boolean;
  owner_id: string | null;
  created_at: string;
  updated_at: string;
}

export function useAvatarRoles() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["avatar_roles", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("avatar_roles")
        .select("*")
        .order("is_preset", { ascending: false })
        .order("name", { ascending: true });

      if (error) throw error;
      return data as AvatarRole[];
    },
    enabled: !!user,
  });
}

export function useCreateAvatarRole() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (role: Omit<AvatarRole, "id" | "created_at" | "updated_at" | "owner_id" | "is_preset">) => {
      if (!user) throw new Error("User must be authenticated");

      const { data, error } = await supabase
        .from("avatar_roles")
        .insert({
          ...role,
          owner_id: user.id,
          is_preset: false,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["avatar_roles"] });
    },
  });
}
```

#### `useAvatarSkills.tsx`
```typescript
export interface AvatarSkill {
  id: string;
  name: string;
  category: string;
  description: string | null;
  prompt_enhancement: string | null;
  is_preset: boolean;
  owner_id: string | null;
  created_at: string;
  updated_at: string;
}

// Similar pattern to useAvatarRoles
```

#### `useConversationAvatarConfig.tsx`
```typescript
export interface ConversationAvatarConfig {
  id: string;
  conversation_id: string;
  avatar_id: string;
  role_id: string | null;
  role?: AvatarRole;
  skills?: AvatarSkill[];
  created_at: string;
  updated_at: string;
}

export function useConversationAvatarConfigs(conversationId: string | null) {
  return useQuery({
    queryKey: ["conversation_avatar_configs", conversationId],
    queryFn: async () => {
      if (!conversationId) return [];

      const { data, error } = await supabase
        .from("conversation_avatar_config")
        .select(`
          *,
          role:avatar_roles(*),
          skills:conversation_avatar_skills(
            skill:avatar_skills(*)
          )
        `)
        .eq("conversation_id", conversationId);

      if (error) throw error;
      return data;
    },
    enabled: !!conversationId,
  });
}
```

### UI Components

#### `AvatarConfigDialog.tsx`
- Dialog for configuring an avatar's role and skills
- Search and select role from preset or custom roles
- Multi-select skills by category
- Preview of generated system prompt
- Save configuration per conversation

#### `RoleManagementPage.tsx`
- Admin/paid user page to create custom roles
- List of preset roles (read-only)
- CRUD for user's custom roles
- Rich text editor for system prompt templates
- Role preview with example outputs

#### `SkillManagementPage.tsx`
- Similar to roles management
- Group skills by category
- Multi-select to assign to avatars
- Skill combination preview

## Edge Function Updates

### `ai-conference/index.ts` Modifications

Add role and skill handling:

```typescript
// Fetch avatar config for this conversation
const { data: avatarConfig } = await supabase
  .from("conversation_avatar_config")
  .select(`
    *,
    role:avatar_roles(*),
    skills:conversation_avatar_skills(
      skill:avatar_skills(*)
    )
  `)
  .eq("conversation_id", conversationId)
  .eq("avatar_id", selectedAvatar)
  .maybeSingle();

// Build enhanced system prompt
let systemPrompt = "You are a helpful AI assistant.";

if (avatarConfig?.role) {
  systemPrompt = avatarConfig.role.system_prompt_template;
}

if (avatarConfig?.skills && avatarConfig.skills.length > 0) {
  const skillEnhancements = avatarConfig.skills
    .map(s => s.skill.prompt_enhancement)
    .filter(Boolean)
    .join("\n\n");
  
  systemPrompt += "\n\nAdditional expertise:\n" + skillEnhancements;
}

// Use systemPrompt in AI API call
const messages = [
  { role: "system", content: systemPrompt },
  ...userMessages
];
```

## User Experience Flow

### Conference Setup
1. User creates new conference from template
2. Template includes pre-configured avatar roles/skills
3. User can customize avatar configurations before starting
4. Chairman can switch avatar roles mid-conference

### Role Selection
1. Click avatar in conference
2. "Configure Avatar" button appears
3. Dialog shows:
   - Current role (if any)
   - Role selector (preset + custom)
   - Skills multi-select grouped by category
   - Prompt preview
   - Save/Cancel buttons

### Premium Features
- Free users: Can only use preset roles/skills
- Paid users: Can create unlimited custom roles and skills
- Admin users: Can create preset roles/skills for all users

## Implementation Phases

### Phase 1: Database Setup
- Create all tables and policies
- Seed preset roles and skills
- Test RLS policies thoroughly

### Phase 2: Backend Logic
- Update edge function to fetch and apply configs
- Implement system prompt generation
- Add conversation config CRUD endpoints

### Phase 3: Frontend Hooks
- Create data fetching hooks
- Implement mutation hooks
- Add React Query caching strategy

### Phase 4: UI Components
- Build avatar config dialog
- Create role management page
- Build skill management page
- Add to Settings navigation

### Phase 5: Integration
- Wire up Conference page
- Add template role/skill presets
- Update AvatarList component
- Add visual indicators for configured avatars

### Phase 6: Testing & Polish
- Test all user flows
- Verify RLS security
- Performance optimization
- Documentation

## Testing Checklist

- [ ] Free user can view preset roles/skills
- [ ] Free user cannot create custom roles/skills
- [ ] Paid user can create custom roles/skills
- [ ] Paid user cannot modify preset roles/skills
- [ ] Admin can manage preset roles/skills
- [ ] Avatar config properly isolated per conversation
- [ ] System prompt correctly generated with role + skills
- [ ] Role/skill changes reflect in AI responses
- [ ] Skills grouped correctly by category
- [ ] No N+1 query issues in config loading
- [ ] RLS prevents cross-user data access

## Future Enhancements
- Import/export role templates
- Community marketplace for roles/skills
- Analytics on most effective role/skill combinations
- AI-suggested role/skill assignments based on conversation topic
- Multi-role support per avatar (primary + secondary)
