# Template Marketplace and Community Templates

## Overview
Create a marketplace where paid users can publish, share, and monetize their custom conference templates. Users can browse, preview, and install templates created by the community, accelerating their workflow and discovering best practices.

## Goals
- Enable paid users to publish custom templates
- Community-driven template discovery
- Rating and review system
- Template versioning and updates
- Optional monetization for creators
- Template categories and tags
- Featured templates section
- Usage analytics for creators

## Database Schema

### Published Templates Table
```sql
CREATE TABLE public.published_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES saved_prompts(id) ON DELETE CASCADE,
  publisher_id UUID NOT NULL, -- User who published
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  long_description TEXT,
  category TEXT NOT NULL,
  tags TEXT[] DEFAULT '{}',
  is_free BOOLEAN DEFAULT true,
  price DECIMAL(10,2), -- NULL if free
  avatar_configs JSONB, -- Pre-configured avatars with roles/skills
  estimated_duration INTEGER, -- Minutes
  thumbnail_url TEXT,
  preview_messages JSONB, -- Sample conversation preview
  version TEXT DEFAULT '1.0.0',
  is_featured BOOLEAN DEFAULT false,
  is_approved BOOLEAN DEFAULT false, -- Admin approval required
  install_count INTEGER DEFAULT 0,
  rating_average DECIMAL(3,2) DEFAULT 0.0,
  rating_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  published_at TIMESTAMPTZ,
  unpublished_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX idx_published_templates_category ON published_templates(category);
CREATE INDEX idx_published_templates_publisher ON published_templates(publisher_id);
CREATE INDEX idx_published_templates_featured ON published_templates(is_featured) WHERE is_featured = true;
CREATE INDEX idx_published_templates_approved ON published_templates(is_approved) WHERE is_approved = true;
CREATE INDEX idx_published_templates_tags ON published_templates USING GIN(tags);

-- Full-text search
CREATE INDEX idx_published_templates_search ON published_templates 
  USING GIN(to_tsvector('english', title || ' ' || description));

-- Enable RLS
ALTER TABLE public.published_templates ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Anyone can view approved published templates"
  ON published_templates FOR SELECT
  USING (is_approved = true AND unpublished_at IS NULL);

CREATE POLICY "Publishers can view their own templates"
  ON published_templates FOR SELECT
  USING (auth.uid() = publisher_id);

CREATE POLICY "Paid users can publish templates"
  ON published_templates FOR INSERT
  WITH CHECK (
    public.is_paid_or_admin(auth.uid()) 
    AND auth.uid() = publisher_id
  );

CREATE POLICY "Publishers can update their own templates"
  ON published_templates FOR UPDATE
  USING (auth.uid() = publisher_id);

CREATE POLICY "Admins can manage all templates"
  ON published_templates FOR ALL
  USING (public.is_admin(auth.uid()));
```

### Template Installations Table
```sql
CREATE TABLE public.template_installations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  published_template_id UUID NOT NULL REFERENCES published_templates(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  installed_prompt_id UUID REFERENCES saved_prompts(id) ON DELETE SET NULL,
  version TEXT NOT NULL,
  installed_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  UNIQUE(published_template_id, user_id)
);

-- Indexes
CREATE INDEX idx_template_installations_user ON template_installations(user_id);
CREATE INDEX idx_template_installations_template ON template_installations(published_template_id);

-- Enable RLS
ALTER TABLE public.template_installations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own installations"
  ON template_installations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can install templates"
  ON template_installations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their installations"
  ON template_installations FOR UPDATE
  USING (auth.uid() = user_id);
```

### Template Reviews Table
```sql
CREATE TABLE public.template_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  published_template_id UUID NOT NULL REFERENCES published_templates(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  title TEXT,
  comment TEXT,
  helpful_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(published_template_id, user_id) -- One review per user per template
);

-- Indexes
CREATE INDEX idx_template_reviews_template ON template_reviews(published_template_id);
CREATE INDEX idx_template_reviews_user ON template_reviews(user_id);
CREATE INDEX idx_template_reviews_rating ON template_reviews(rating);

-- Enable RLS
ALTER TABLE public.template_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view reviews"
  ON template_reviews FOR SELECT
  USING (true);

CREATE POLICY "Users can create reviews for installed templates"
  ON template_reviews FOR INSERT
  WITH CHECK (
    auth.uid() = user_id 
    AND EXISTS (
      SELECT 1 FROM template_installations 
      WHERE published_template_id = published_template_id 
      AND user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their own reviews"
  ON template_reviews FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own reviews"
  ON template_reviews FOR DELETE
  USING (auth.uid() = user_id);
```

### Template Categories (Preset)
```sql
CREATE TABLE public.template_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  icon TEXT, -- Lucide icon name
  display_order INTEGER DEFAULT 0
);

-- Seed categories
INSERT INTO template_categories (name, description, icon, display_order) VALUES
('Software Development', 'Code review, architecture, debugging', 'Code', 1),
('Product Design', 'UX research, wireframes, prototypes', 'Figma', 2),
('Content Creation', 'Writing, editing, brainstorming', 'PenTool', 3),
('Business Strategy', 'Planning, analysis, decision-making', 'Briefcase', 4),
('Education', 'Learning, tutoring, curriculum', 'GraduationCap', 5),
('Marketing', 'Campaigns, copywriting, SEO', 'Megaphone', 6),
('Data Analysis', 'SQL, visualization, insights', 'BarChart', 7),
('Creative', 'Ideation, storytelling, art direction', 'Sparkles', 8);
```

### Triggers for Rating Updates
```sql
-- Update average rating when review is added/updated
CREATE OR REPLACE FUNCTION update_template_rating()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE published_templates
  SET 
    rating_average = (
      SELECT AVG(rating)::DECIMAL(3,2)
      FROM template_reviews
      WHERE published_template_id = NEW.published_template_id
    ),
    rating_count = (
      SELECT COUNT(*)
      FROM template_reviews
      WHERE published_template_id = NEW.published_template_id
    )
  WHERE id = NEW.published_template_id;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_review_insert
  AFTER INSERT ON template_reviews
  FOR EACH ROW EXECUTE FUNCTION update_template_rating();

CREATE TRIGGER on_review_update
  AFTER UPDATE ON template_reviews
  FOR EACH ROW EXECUTE FUNCTION update_template_rating();

-- Update install count
CREATE OR REPLACE FUNCTION increment_install_count()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE published_templates
  SET install_count = install_count + 1
  WHERE id = NEW.published_template_id;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_template_install
  AFTER INSERT ON template_installations
  FOR EACH ROW EXECUTE FUNCTION increment_install_count();
```

## Frontend Implementation

### React Hooks

#### `usePublishedTemplates.tsx`
```typescript
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PublishedTemplate {
  id: string;
  template_id: string;
  publisher_id: string;
  title: string;
  description: string;
  long_description: string | null;
  category: string;
  tags: string[];
  is_free: boolean;
  price: number | null;
  thumbnail_url: string | null;
  version: string;
  is_featured: boolean;
  install_count: number;
  rating_average: number;
  rating_count: number;
  created_at: string;
  published_at: string | null;
}

export interface TemplateFilters {
  category?: string;
  tags?: string[];
  search?: string;
  sortBy?: "popular" | "recent" | "rating";
  isFree?: boolean;
}

export function usePublishedTemplates(filters: TemplateFilters = {}) {
  return useQuery({
    queryKey: ["published_templates", filters],
    queryFn: async () => {
      let query = supabase
        .from("published_templates")
        .select("*")
        .eq("is_approved", true)
        .is("unpublished_at", null);

      // Apply filters
      if (filters.category) {
        query = query.eq("category", filters.category);
      }

      if (filters.tags && filters.tags.length > 0) {
        query = query.contains("tags", filters.tags);
      }

      if (filters.search) {
        query = query.textSearch("fts", filters.search, {
          type: "websearch",
          config: "english",
        });
      }

      if (filters.isFree !== undefined) {
        query = query.eq("is_free", filters.isFree);
      }

      // Sort
      switch (filters.sortBy) {
        case "popular":
          query = query.order("install_count", { ascending: false });
          break;
        case "rating":
          query = query.order("rating_average", { ascending: false });
          break;
        case "recent":
        default:
          query = query.order("published_at", { ascending: false });
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as PublishedTemplate[];
    },
  });
}

export function usePublishedTemplate(templateId: string | null) {
  return useQuery({
    queryKey: ["published_template", templateId],
    queryFn: async () => {
      if (!templateId) return null;

      const { data, error } = await supabase
        .from("published_templates")
        .select(`
          *,
          publisher:profiles!publisher_id(*),
          reviews:template_reviews(*),
          installations:template_installations(count)
        `)
        .eq("id", templateId)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!templateId,
  });
}

export function usePublishTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      templateId,
      title,
      description,
      longDescription,
      category,
      tags,
      isFree,
      price,
      thumbnailUrl,
    }: {
      templateId: string;
      title: string;
      description: string;
      longDescription?: string;
      category: string;
      tags: string[];
      isFree: boolean;
      price?: number;
      thumbnailUrl?: string;
    }) => {
      const { data, error } = await supabase
        .from("published_templates")
        .insert({
          template_id: templateId,
          publisher_id: (await supabase.auth.getUser()).data.user?.id,
          title,
          description,
          long_description: longDescription,
          category,
          tags,
          is_free: isFree,
          price,
          thumbnail_url: thumbnailUrl,
          published_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["published_templates"] });
    },
  });
}

export function useInstallTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      publishedTemplateId,
      version,
    }: {
      publishedTemplateId: string;
      version: string;
    }) => {
      // Clone the template into user's library
      const { data: published } = await supabase
        .from("published_templates")
        .select("*, template:saved_prompts(*)")
        .eq("id", publishedTemplateId)
        .single();

      if (!published) throw new Error("Template not found");

      // Create new prompt in user's library
      const { data: newPrompt, error: promptError } = await supabase
        .from("saved_prompts")
        .insert({
          title: published.title,
          description: published.description,
          script: published.template.script,
          owner_id: (await supabase.auth.getUser()).data.user?.id,
        })
        .select()
        .single();

      if (promptError) throw promptError;

      // Record installation
      const { data, error } = await supabase
        .from("template_installations")
        .insert({
          published_template_id: publishedTemplateId,
          user_id: (await supabase.auth.getUser()).data.user?.id,
          installed_prompt_id: newPrompt.id,
          version,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["template_installations"] });
      queryClient.invalidateQueries({ queryKey: ["prompts"] });
    },
  });
}
```

### UI Components

#### `TemplateBrowser.tsx`
```typescript
// src/pages/TemplateBrowser.tsx
import { useState } from "react";
import { usePublishedTemplates } from "@/hooks/usePublishedTemplates";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Star, Download, TrendingUp } from "lucide-react";
import TemplateCard from "@/components/TemplateCard";

export default function TemplateBrowser() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>();
  const [sortBy, setSortBy] = useState<"popular" | "recent" | "rating">("popular");

  const { data: templates, isLoading } = usePublishedTemplates({
    search,
    category,
    sortBy,
  });

  const { data: featured } = usePublishedTemplates({
    sortBy: "rating",
  });

  return (
    <div className="container mx-auto p-8">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-4">Template Marketplace</h1>
        <p className="text-muted-foreground">
          Discover and install conference templates created by the community
        </p>
      </div>

      {/* Featured Templates */}
      {featured && featured.length > 0 && (
        <div className="mb-12">
          <h2 className="text-2xl font-semibold mb-4 flex items-center">
            <Star className="mr-2 h-6 w-6 text-yellow-500" />
            Featured Templates
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {featured.slice(0, 3).map((template) => (
              <TemplateCard key={template.id} template={template} featured />
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-4 mb-8">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search templates..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All Categories</SelectItem>
            {/* Map categories */}
          </SelectContent>
        </Select>

        <Select value={sortBy} onValueChange={(v: any) => setSortBy(v)}>
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="popular">Most Popular</SelectItem>
            <SelectItem value="recent">Recently Added</SelectItem>
            <SelectItem value="rating">Highest Rated</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Template Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {isLoading ? (
          <div>Loading...</div>
        ) : (
          templates?.map((template) => (
            <TemplateCard key={template.id} template={template} />
          ))
        )}
      </div>
    </div>
  );
}
```

#### `PublishTemplateDialog.tsx`
```typescript
// Dialog for publishing a template
- Select template from user's library
- Add title, description, category
- Upload thumbnail
- Set pricing (free or paid)
- Add tags
- Preview before publishing
```

#### `TemplateDetailsPage.tsx`
```typescript
// Full template details page
- Large preview
- Description and features
- Creator info
- Reviews and ratings
- Install button
- Usage examples
- Related templates
```

## Implementation Phases

### Phase 1: Database & Core
- [ ] Create all tables and policies
- [ ] Seed template categories
- [ ] Implement publish/install logic
- [ ] Test RLS thoroughly

### Phase 2: Browse & Discovery
- [ ] Build template browser page
- [ ] Implement search and filters
- [ ] Create template card component
- [ ] Add featured templates section

### Phase 3: Publishing
- [ ] Build publish dialog
- [ ] Add thumbnail upload
- [ ] Implement approval workflow
- [ ] Create publisher dashboard

### Phase 4: Reviews & Ratings
- [ ] Build review system
- [ ] Add rating submission
- [ ] Display ratings on cards
- [ ] Implement helpful votes

### Phase 5: Analytics & Polish
- [ ] Creator analytics dashboard
- [ ] Usage tracking
- [ ] Template updates/versioning
- [ ] Performance optimization

## Testing Checklist

- [ ] Only paid users can publish
- [ ] Templates require approval
- [ ] Install creates copy in user library
- [ ] Ratings update correctly
- [ ] Search returns relevant results
- [ ] Filters work correctly
- [ ] RLS prevents unauthorized edits
- [ ] Featured templates display
- [ ] Reviews require installation

## Future Enhancements
- Template collections/bundles
- Auto-update installed templates
- Template analytics for publishers
- Revenue sharing for paid templates
- Community challenges/contests
- Template remixing/forking
- API for programmatic access
