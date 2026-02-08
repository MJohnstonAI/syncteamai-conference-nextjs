# OPENROUTER_BYOK_HANDOVER_v2.md - Complete Implementation Specification

## 📋 Document Overview

This is the **authoritative handover document** for implementing Open Router BYOK (Bring Your Own Key) integration with drag-and-drop avatar ordering. **All design decisions have been finalized**. Codex must follow this specification exactly.

**Total Credit Budget:** 920-1020 credits  
**Implementation Time:** 10 phases (sequential execution required)  
**Project Owner:** SyncTeamAI (Marc)  
**Target Users:** Paid subscribers only (admin users remain on Lovable AI Gateway)

---

## 🎯 Mission Statement

Replace the current multi-provider BYOK system and WebLLM client-side models with a **single Open Router integration** that:

1. Allows paid subscribers to use **one API key** to access 25-30 curated AI models
2. Provides a **dynamic avatar panel** where avatars appear/disappear based on dropdown selection
3. Implements **drag-and-drop ordering** so models respond in user-defined roundtable sequence
4. Maintains **3-state avatar logic**: 🔑 Active | 🔒 Silent | ❌ Not Selected
5. **Preserves 100% of existing admin logic** (Lovable AI Gateway for testing)

---

## 🚫 CRITICAL: RED LINES (DO NOT CROSS)

### Files You MUST NOT Edit
```
❌ src/integrations/supabase/client.ts (auto-generated)
❌ src/integrations/supabase/types.ts (auto-generated)
❌ supabase/config.toml (auto-managed, except adding functions)
❌ .env (auto-provisioned)
```

### Logic You MUST NOT Change
```typescript
// ❌ DO NOT MODIFY THIS ADMIN CHECK
// File: src/hooks/useUserProfile.tsx
if (user.email === "marcaj777@gmail.com") {
  return { id: user.id, tier: "admin", ... };
}

// ❌ DO NOT MODIFY THIS ROUTING LOGIC
// File: supabase/functions/ai-conference/index.ts
if (isAdmin) {
  apiKey = LOVABLE_API_KEY;
  endpoint = "https://ai.gateway.lovable.dev/v1/chat/completions";
  // ... existing admin flow
}
```

### Architecture Constraints
```
❌ DO NOT add `auth_role` column to profiles table
❌ DO NOT implement parallel SSE multiplexed lanes
❌ DO NOT create nightly catalog sync jobs
❌ DO NOT add read replicas or partitioning (future Phase 11+)
❌ DO NOT remove existing WebLLM code (comment out only)
```

**Rationale:** The project owner has documented these as planned future refactors. Changing them now risks breaking the existing admin testing flow and violates the Custom Knowledge security architecture.

---

## 📐 Current vs. Target Architecture

### Current State (Before Implementation)
```
Settings Page:
├── OpenAI BYOK Card
├── Anthropic BYOK Card  
├── Google BYOK Card
├── xAI BYOK Card
└── WebLLM Model Cache Settings

Conference Page:
├── Avatar Panel (9 default avatars always visible)
│   ├── Lock icons on locked avatars (non-paid)
│   └── Key icons on BYOK-unlocked avatars
├── Message Input
└── Multi-role selector (1-6 agents)

Message Flow:
├── Free users → WebLLM (llama/qwen only)
├── Paid users → Individual BYOK providers OR WebLLM
└── Admin → Lovable AI Gateway (gemini-2.5-flash)
```

### Target State (After Implementation)
```
Settings Page:
├── Open Router BYOK Card (single card, replaces 4 provider cards)
│   ├── API key input (masked: sk-or-••••••••1234)
│   ├── Validate & Save button
│   ├── Revoke button
│   └── Toggle: "Don't store (session only)"
└── [WebLLM settings removed]

Conference Page:
├── Model Selection Dropdown (new component)
│   ├── Multi-select, searchable
│   ├── Grouped by provider (OpenAI, Anthropic, Google, etc.)
│   └── Shows 25-30 curated models
├── Dynamic Avatar Panel (rewritten)
│   ├── Drag-and-drop reordering
│   ├── Sequence badges (①②③) on selected avatars
│   ├── 3-state icons: 🔑 Active | 🔒 Silent | ❌ Not Selected
│   ├── Default avatars (9): always visible, show ❌ when not selected
│   └── Custom avatars: appear only when model is selected in dropdown
├── Message Input
└── [Multi-role selector removed - replaced by dropdown + drag-and-drop]

Message Flow:
├── Free users → Upsell to paid plan (WebLLM removed)
├── Paid users → Open Router API (all active 🔑 models in roundtable order)
└── Admin → Lovable AI Gateway (unchanged, preserved 100%)
```

---

## 🎨 UX/UI Specifications

### 1. Model Selection Dropdown Component

**Location:** `src/components/ModelSelectionDropdown.tsx` (new file)

**Behavior:**
- **Multi-select:** User can select 1-6 models
- **Searchable:** Filter by model name or provider
- **Grouped:** Models grouped by provider (OpenAI, Anthropic, Google, xAI, Meta, Mistral)
- **Visual:** Checkboxes for selected models, provider logos/icons
- **Sync:** Selecting a model auto-adds it to avatar panel as 🔑 Active

**Props Interface:**
```typescript
interface ModelSelectionDropdownProps {
  selectedModels: string[]; // Array of model IDs (e.g., ["openai/gpt-4o", "anthropic/claude-opus-4"])
  onSelectionChange: (models: string[]) => void;
  disabled?: boolean; // True if no Open Router key configured
}
```

**Example UI:**
```
┌─────────────────────────────────────┐
│ Select Models ▼                     │
├─────────────────────────────────────┤
│ 🔍 Search models...                 │
├─────────────────────────────────────┤
│ OpenAI                              │
│  ☑ GPT-4o (Recommended)             │
│  ☐ GPT-4o Mini                      │
│  ☐ o1                               │
│                                     │
│ Anthropic                           │
│  ☑ Claude Opus 4                    │
│  ☐ Claude Sonnet 4.5                │
│                                     │
│ Google                              │
│  ☐ Gemini 2.5 Pro                   │
│                                     │
│ Selected: 2/6 models                │
└─────────────────────────────────────┘
```

---

### 2. Dynamic Avatar Panel (3-State Logic)

**Location:** `src/components/AvatarList.tsx` (complete rewrite)

**Avatar States:**

| State           | Icon | Behavior                                         | Applies To               |
|-----------------|------|------------------------------------------------|-------------------------|
| **🔑 Active**    | Key icon | Model is selected in dropdown AND will respond in chat | All selected models      |
| **🔒 Silent**   | Lock icon | Model is selected in dropdown BUT muted (won't respond) | All selected models (after clicking 🔑) |
| **❌ Not Selected** | X icon | Model not in dropdown selection; avatar is placeholder | Default avatars only (9 avatars) |

**Click Behavior:**
- **🔑 (Active):** Click → Toggle to 🔒 (Silent)
- **🔒 (Silent):** Click → Toggle back to 🔑 (Active)
- **❌ (Not Selected):** Click → Auto-add model's smart default to dropdown, set to 🔑 Active

**Drag-and-Drop Behavior:**
- User drags avatar to reorder
- Sequence numbers (①②③④⑤⑥) appear on selected avatars
- Roundtable order follows drag-and-drop sequence (top to bottom, left to right)
- Dragging avatar #3 to position #1 → others shift down automatically

**Default Avatars (Always Visible):**
These 9 avatars are **always rendered** in the panel, regardless of dropdown selection. They show ❌ when not selected.

| Avatar ID | Name    | Smart Default Model               | Provider |
|-----------|---------|---------------------------------|----------|
| `chatgpt` | ChatGPT | `openai/gpt-4o`                 | OpenAI   |
| `claude`  | Claude  | `anthropic/claude-opus-4`       | Anthropic|
| `gemini`  | Gemini  | `google/gemini-2.5-pro`          | Google   |
| `grok`    | Grok    | `xai/grok-2-latest`              | xAI      |
| `llama`   | Llama   | `meta/llama-3.3-70b-instruct`   | Meta     |
| `mistral` | Mistral | `mistralai/mistral-large-2`     | Mistral AI|
| `qwen`    | Qwen    | `qwen/qwen-2.5-72b-instruct`    | Alibaba  |
| `phi`     | Phi     | `microsoft/phi-4`                | Microsoft|
| `gemma`   | Gemma   | `google/gemma-2-27b-it`          | Google   |

**Custom Avatars (Dynamic):**
If a user selects a model **not in the default 9**, a new avatar appears:
- **Image:** Generic AI robot icon OR provider logo
- **Label:** Model name (e.g., "DeepSeek R1")
- **State:** Always 🔑 Active when first added
- **Removal:** Disappears when model is deselected from dropdown

**Visual Example:**
```
┌─────────────────────────────────────────────┐
│ Avatar Panel                   [Reset Order] │
├─────────────────────────────────────────────┤
│  ┌───┐  ┌───┐  ┌───┐                        │
│  │🔑①│  │🔒②│  │❌ │   ← Default avatars     │
│  │GPT│  │Cla│  │Gem│                        │
│  └───┘  └───┘  └───┘                        │
│  (drag)  (mute) (not selected)               │
│                                             │
│  ┌───┐  ┌───┐                               │
│  │🔑③│  │🔑④│              ← Custom avatars │
│  │R1 │  │Mis│                               │
│  └───┘  └───┘                               │
│  (DeepSeek) (Mistral)                       │
└─────────────────────────────────────────────┘
```

---

### 3. Model Removal Behavior

**When a user removes a model from the dropdown:**

| Avatar Type       | Behavior                              |
|-------------------|-------------------------------------|
| **Default avatars** (9 avatars) | Revert to ❌ Not Selected state, remain visible |
| **Custom avatars** | Disappear entirely from panel        |

**Example:**
```
User has selected: [gpt-4o, claude-opus-4, deepseek-r1]

Avatar Panel Shows:
- ChatGPT (🔑①)
- Claude (🔑②)  
- DeepSeek R1 (🔑③) ← custom avatar
- Gemini (❌)
- Grok (❌)
- ... (all other defaults with ❌)

User removes "deepseek-r1" from dropdown:

Avatar Panel Now Shows:
- ChatGPT (🔑①)
- Claude (🔑②)
- Gemini (❌)
- Grok (❌)
- ... (DeepSeek R1 avatar has disappeared)
```

---

### 4. Drag-and-Drop Ordering

**User Flow:**
1. User selects 3 models in dropdown: [GPT-4o, Claude Opus 4, Gemini 2.5 Pro]
2. Avatar panel shows: ChatGPT (🔑①), Claude (🔑②), Gemini (🔑③)
3. User drags Gemini avatar to position #1
4. New order: Gemini (🔑①), ChatGPT (🔑②), Claude (🔑③)
5. When user sends a message:
   - Gemini responds first
   - ChatGPT responds second
   - Claude responds third

**Technical Implementation:**
- Use `@dnd-kit/core` + `@dnd-kit/sortable` for drag-and-drop
- Store order in `sessionStorage` as `avatar_order: string[]`
- Persist order across page refreshes
- "Reset Order" button restores default alphabetical order

**Visual Feedback During Drag:**
```
┌─────────────────────────────┐
│  ┌───┐                      │
│  │🔑②│  ← Being dragged     │
│  │GPT│     (semi-transparent)│
│  └───┘                      │
│                             │
│  ┌───┐  ┌───┐              │
│  │🔑①│  │🔑③│  ← Drop zones │
│  │Gem│  │Cla│  (highlighted) │
│  └───┘  └───┘              │
└─────────────────────────────┘
```

---

## 💾 State Management

### sessionStorage Schema

**Location:** `src/hooks/useBYOK.tsx`

```typescript
// sessionStorage key: "byok_openrouter"
interface OpenRouterState {
  openRouterKey: string | null;        // API key (if "Don't store" toggle is OFF, this is empty)
  selectedModels: string[];            // ["openai/gpt-4o", "anthropic/claude-opus-4"]
  activeModels: string[];              // ["openai/gpt-4o"] (excludes 🔒 Silent models)
  avatarOrder: string[];               // ["gemini", "chatgpt", "claude"] (drag-and-drop sequence)
  storeKey: boolean;                   // True = save to DB, False = session-only
}
```

**Default State (New User):**
```json
{
  "openRouterKey": null,
  "selectedModels": ["openai/gpt-4o", "anthropic/claude-opus-4"],
  "activeModels": ["openai/gpt-4o", "anthropic/claude-opus-4"],
  "avatarOrder": ["chatgpt", "claude", "gemini", "grok", "llama", "mistral", "qwen", "phi", "gemma"],
  "storeKey": true
}
```

**Persistence:**
- `selectedModels`, `activeModels`, `avatarOrder` → Always saved to sessionStorage
- `openRouterKey` → Only in sessionStorage if `storeKey = false`; otherwise encrypted in DB

---

## 🗄️ Database Schema

### New Table: `user_api_keys`

**Purpose:** Server-side encrypted storage for Open Router API keys

**Migration SQL:**
```sql
-- Phase 2: Create encrypted key storage table
CREATE TABLE IF NOT EXISTS public.user_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider = 'openrouter'),
  encrypted_key TEXT NOT NULL,
  key_version INT NOT NULL DEFAULT 1,
  last_four CHAR(4) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, provider)
);

-- Index for fast lookups
CREATE INDEX idx_user_api_keys_user_provider ON public.user_api_keys(user_id, provider);

-- RLS Policies
ALTER TABLE public.user_api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own API keys"
  ON public.user_api_keys
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.user_api_keys
  FOR EACH ROW
  EXECUTE FUNCTION handle_updated_at();

-- Comment for documentation
COMMENT ON TABLE public.user_api_keys IS 'Encrypted storage for user API keys. Uses envelope encryption: per-user data key encrypts the API key, server secret encrypts the data key.';
```

**Encryption Strategy:**
1. Generate random 32-byte data key (per user, per key save)
2. Encrypt API key with data key using AES-256-GCM
3. Encrypt data key with server secret (`ENCRYPTION_SECRET` env var)
4. Store: `encrypted_key = {iv}:{encryptedDataKey}:{encryptedApiKey}:{authTag}`
5. On retrieval: decrypt data key → decrypt API key

**Security Properties:**
- ✅ Server secret rotation supported via `key_version`
- ✅ Per-user keys isolated (one compromised key ≠ all compromised)
- ✅ RLS policies prevent cross-user access
- ✅ Last 4 chars stored for UI masking

---

## 📦 Implementation Phases

### Phase 1: Create Model Data File (80 credits)

**File:** `src/data/openRouterModels.ts` (new)

**Objective:** Define curated model catalog and smart defaults mapping

**Code:**
```typescript
export interface OpenRouterModel {
  id: string;               // e.g., "openai/gpt-4o"
  name: string;            // e.g., "GPT-4o"
  provider: string;        // e.g., "openai"
  tier: 'free' | 'premium' | 'pro';
  contextWindow: number;   // e.g., 128000
  pricing?: {
    input: number;         // per 1M tokens
    output: number;        // per 1M tokens
  };
  description?: string;
  capabilities?: string[]; // ["vision", "json-mode", "function-calling"]
}

export const OPENROUTER_MODELS: OpenRouterModel[] = [
  // OpenAI (5 models)
  {
    id: 'openai/gpt-4o',
    name: 'GPT-4o',
    provider: 'openai',
    tier: 'premium',
    contextWindow: 128000,
    pricing: { input: 2.5, output: 10 },
    description: 'Flagship multimodal model with vision and advanced reasoning',
    capabilities: ['vision', 'json-mode', 'function-calling']
  },
  {
    id: 'openai/gpt-4o-mini',
    name: 'GPT-4o Mini',
    provider: 'openai',
    tier: 'free',
    contextWindow: 128000,
    pricing: { input: 0.15, output: 0.6 },
    description: 'Faster, more affordable version of GPT-4o'
  },
  {
    id: 'openai/o1',
    name: 'o1',
    provider: 'openai',
    tier: 'pro',
    contextWindow: 200000,
    pricing: { input: 15, output: 60 },
    description: 'Extended reasoning model for complex problem-solving'
  },
  {
    id: 'openai/o1-mini',
    name: 'o1 Mini',
    provider: 'openai',
    tier: 'premium',
    contextWindow: 128000,
    pricing: { input: 3, output: 12 },
    description: 'Compact reasoning model'
  },
  {
    id: 'openai/gpt-4-turbo',
    name: 'GPT-4 Turbo',
    provider: 'openai',
    tier: 'premium',
    contextWindow: 128000,
    pricing: { input: 10, output: 30 },
    description: 'Previous generation flagship model'
  },

  // Anthropic (5 models)
  {
    id: 'anthropic/claude-opus-4',
    name: 'Claude Opus 4',
    provider: 'anthropic',
    tier: 'pro',
    contextWindow: 200000,
    pricing: { input: 15, output: 75 },
    description: 'Most capable Claude model for complex tasks',
    capabilities: ['vision', 'extended-thinking']
  },
  {
    id: 'anthropic/claude-sonnet-4.5',
    name: 'Claude Sonnet 4.5',
    provider: 'anthropic',
    tier: 'premium',
    contextWindow: 200000,
    pricing: { input: 3, output: 15 },
    description: 'Balanced performance and speed'
  },
  {
    id: 'anthropic/claude-sonnet-4',
    name: 'Claude Sonnet 4',
    provider: 'anthropic',
    tier: 'premium',
    contextWindow: 200000,
    pricing: { input: 3, output: 15 }
  },
  {
    id: 'anthropic/claude-haiku-3.5',
    name: 'Claude Haiku 3.5',
    provider: 'anthropic',
    tier: 'free',
    contextWindow: 200000,
    pricing: { input: 0.8, output: 4 },
    description: 'Fastest Claude model for quick responses'
  },
  {
    id: 'anthropic/claude-3.7-sonnet',
    name: 'Claude 3.7 Sonnet',
    provider: 'anthropic',
    tier: 'premium',
    contextWindow: 200000,
    pricing: { input: 3, output: 15 },
    description: 'Extended thinking capabilities'
  },

  // Google (4 models)
  {
    id: 'google/gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    provider: 'google',
    tier: 'premium',
    contextWindow: 2097152,
    pricing: { input: 1.25, output: 5 },
    description: 'Massive context window for document analysis',
    capabilities: ['vision', 'ultra-long-context']
  },
  {
    id: 'google/gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    provider: 'google',
    tier: 'free',
    contextWindow: 1048576,
    pricing: { input: 0.075, output: 0.3 },
    description: 'Fast and cost-effective'
  },
  {
    id: 'google/gemini-exp-1206',
    name: 'Gemini Experimental',
    provider: 'google',
    tier: 'pro',
    contextWindow: 2097152,
    description: 'Cutting-edge experimental model'
  },
  {
    id: 'google/gemma-2-27b-it',
    name: 'Gemma 2 27B',
    provider: 'google',
    tier: 'free',
    contextWindow: 8192,
    pricing: { input: 0.27, output: 0.27 },
    description: 'Open-source model from Google'
  },

  // xAI (2 models)
  {
    id: 'xai/grok-2-latest',
    name: 'Grok 2',
    provider: 'xai',
    tier: 'premium',
    contextWindow: 131072,
    pricing: { input: 2, output: 10 },
    description: 'Latest Grok model with real-time knowledge'
  },
  {
    id: 'xai/grok-2-vision',
    name: 'Grok 2 Vision',
    provider: 'xai',
    tier: 'premium',
    contextWindow: 131072,
    pricing: { input: 2, output: 10 },
    capabilities: ['vision']
  },

  // Meta (3 models)
  {
    id: 'meta/llama-3.3-70b-instruct',
    name: 'Llama 3.3 70B',
    provider: 'meta',
    tier: 'free',
    contextWindow: 128000,
    pricing: { input: 0.35, output: 0.4 },
    description: 'Latest Llama model, open-source'
  },
  {
    id: 'meta/llama-3.1-405b-instruct',
    name: 'Llama 3.1 405B',
    provider: 'meta',
    tier: 'premium',
    contextWindow: 131072,
    pricing: { input: 2.7, output: 2.7 },
    description: 'Largest Llama model'
  },
  {
    id: 'meta/llama-3.1-8b-instruct',
    name: 'Llama 3.1 8B',
    provider: 'meta',
    tier: 'free',
    contextWindow: 131072,
    pricing: { input: 0.055, output: 0.055 },
    description: 'Compact, fast Llama model'
  },

  // Mistral (3 models)
  {
    id: 'mistralai/mistral-large-2',
    name: 'Mistral Large 2',
    provider: 'mistralai',
    tier: 'premium',
    contextWindow: 131072,
    pricing: { input: 2, output: 6 },
    description: 'Flagship Mistral model'
  },
  {
    id: 'mistralai/mistral-small-2',
    name: 'Mistral Small 2',
    provider: 'mistralai',
    tier: 'free',
    contextWindow: 131072,
    pricing: { input: 0.2, output: 0.6 },
    description: 'Compact Mistral model'
  },
  {
    id: 'mistralai/pixtral-large',
    name: 'Pixtral Large',
    provider: 'mistralai',
    tier: 'premium',
    contextWindow: 131072,
    pricing: { input: 2, output: 6 },
    capabilities: ['vision']
  },

  // Alibaba (2 models)
  {
    id: 'qwen/qwen-2.5-72b-instruct',
    name: 'Qwen 2.5 72B',
    provider: 'qwen',
    tier: 'free',
    contextWindow: 131072,
    pricing: { input: 0.35, output: 0.4 },
    description: "Alibaba's flagship model"
  },
  {
    id: 'qwen/qwen-2.5-coder-32b-instruct',
    name: 'Qwen 2.5 Coder',
    provider: 'qwen',
    tier: 'free',
    contextWindow: 131072,
    pricing: { input: 0.14, output: 0.14 },
    description: 'Specialized for code generation'
  },

  // Microsoft (1 model)
  {
    id: 'microsoft/phi-4',
    name: 'Phi-4',
    provider: 'microsoft',
    tier: 'free',
    contextWindow: 16384,
    pricing: { input: 0, output: 0 },
    description: 'Free small language model from Microsoft'
  },

  // DeepSeek (2 models)
  {
    id: 'deepseek/deepseek-r1',
    name: 'DeepSeek R1',
    provider: 'deepseek',
    tier: 'premium',
    contextWindow: 65536,
    pricing: { input: 0.55, output: 2.19 },
    description: 'Advanced reasoning model'
  },
  {
    id: 'deepseek/deepseek-chat',
    name: 'DeepSeek Chat',
    provider: 'deepseek',
    tier: 'free',
    contextWindow: 65536,
    pricing: { input: 0.14, output: 0.28 }
  }
];

// Smart defaults mapping (9 default avatars → Open Router models)
export const SMART_DEFAULTS: Record<string, string> = {
  chatgpt: 'openai/gpt-4o',
  claude: 'anthropic/claude-opus-4',
  gemini: 'google/gemini-2.5-pro',
  grok: 'xai/grok-2-latest',
  llama: 'meta/llama-3.3-70b-instruct',
  mistral: 'mistralai/mistral-large-2',
  qwen: 'qwen/qwen-2.5-72b-instruct',
  phi: 'microsoft/phi-4',
  gemma: 'google/gemma-2-27b-it'
};

// Default avatar order (alphabetical by name)
export const DEFAULT_AVATAR_ORDER = [
  'chatgpt',
  'claude',
  'gemini',
  'grok',
  'llama',
  'mistral',
  'qwen',
  'phi',
  'gemma'
];

// Helper function to get provider logo/icon
export function getProviderLogo(provider: string): string {
  const logos: Record<string, string> = {
    openai: '🟢',
    anthropic: '🔶',
    google: '🔵',
    xai: '⚡',
    meta: '🦙',
    mistralai: '🌊',
    qwen: '☁️',
    microsoft: '💠',
    deepseek: '🌌'
  };
  return logos[provider] || '🤖';
}

// Helper to get model by ID
export function getModelById(id: string): OpenRouterModel | undefined {
  return OPENROUTER_MODELS.find(m => m.id === id);
}

// Helper to group models by provider
export function getModelsByProvider(): Record<string, OpenRouterModel[]> {
  const grouped: Record<string, OpenRouterModel[]> = {};
  OPENROUTER_MODELS.forEach(model => {
    if (!grouped[model.provider]) {
      grouped[model.provider] = [];
    }
    grouped[model.provider].push(model);
  });
  return grouped;
}
```

**Testing:**
- ✅ All 30 models have valid IDs, names, providers
- ✅ `SMART_DEFAULTS` keys match default avatar IDs
- ✅ No duplicate model IDs

---

### Phase 2: Update `useBYOK` Hook (100 credits)

**File:** `src/hooks/useBYOK.tsx` (major rewrite)

**Objective:** Replace multi-provider state with single Open Router state + avatar ordering

**Code:**
```typescript
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { registerBYOKClear } from './useAuth';
import { DEFAULT_AVATAR_ORDER, SMART_DEFAULTS } from '@/data/openRouterModels';

interface OpenRouterState {
  openRouterKey: string | null;
  selectedModels: string[];
  activeModels: string[];
  avatarOrder: string[];
  storeKey: boolean;
}

interface BYOKContextType {
  // Open Router state
  openRouterKey: string | null;
  selectedModels: string[];
  activeModels: string[];
  avatarOrder: string[];
  storeKey: boolean;

  // Actions
  setOpenRouterKey: (key: string, shouldStore?: boolean) => void;
  clearOpenRouterKey: () => void;
  setSelectedModels: (models: string[]) => void;
  toggleModelActive: (modelId: string) => void;
  reorderAvatars: (newOrder: string[]) => void;
  resetAvatarOrder: () => void;
  isModelActive: (modelId: string) => boolean;
  
  // Helpers
  getModelForAvatar: (avatarId: string) => string | null;
  getAvatarForModel: (modelId: string) => string | null;
}

const BYOKContext = createContext<BYOKContextType | undefined>(undefined);

const STORAGE_KEY = 'byok_openrouter';
const DEFAULT_STATE: OpenRouterState = {
  openRouterKey: null,
  selectedModels: ['openai/gpt-4o', 'anthropic/claude-opus-4'], // Smart defaults
  activeModels: ['openai/gpt-4o', 'anthropic/claude-opus-4'],
  avatarOrder: DEFAULT_AVATAR_ORDER,
  storeKey: true
};

export const BYOKProvider = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState<OpenRouterState>(DEFAULT_STATE);

  // Load from sessionStorage on mount
  useEffect(() => {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as OpenRouterState;
        setState(parsed);
      } catch (e) {
        console.error('[useBYOK] Failed to parse stored state:', e);
        sessionStorage.removeItem(STORAGE_KEY);
      }
    }
  }, []);

  // Save to sessionStorage whenever state changes
  useEffect(() => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const setOpenRouterKey = (key: string, shouldStore = true) => {
    setState(prev => ({ ...prev, openRouterKey: key, storeKey: shouldStore }));
  };

  const clearOpenRouterKey = () => {
    setState(prev => ({ ...prev, openRouterKey: null }));
  };

  const setSelectedModels = (models: string[]) => {
    setState(prev => ({
      ...prev,
      selectedModels: models,
      // Auto-activate newly selected models
      activeModels: [...prev.activeModels, ...models.filter(m => !prev.activeModels.includes(m))]
    }));
  };

  const toggleModelActive = (modelId: string) => {
    setState(prev => {
      const isActive = prev.activeModels.includes(modelId);
      return {
        ...prev,
        activeModels: isActive
          ? prev.activeModels.filter(id => id !== modelId)
          : [...prev.activeModels, modelId]
      };
    });
  };

  const reorderAvatars = (newOrder: string[]) => {
    setState(prev => ({ ...prev, avatarOrder: newOrder }));
  };

  const resetAvatarOrder = () => {
    setState(prev => ({ ...prev, avatarOrder: DEFAULT_AVATAR_ORDER }));
  };

  const isModelActive = (modelId: string) => {
    return state.activeModels.includes(modelId);
  };

  const getModelForAvatar = (avatarId: string): string | null => {
    // Check if user has explicitly selected a model for this avatar
    const matchingModel = state.selectedModels.find(modelId => {
      const avatarForModel = getAvatarForModel(modelId);
      return avatarForModel === avatarId;
    });
    
    if (matchingModel) return matchingModel;
    
    // Fallback to smart default
    return SMART_DEFAULTS[avatarId] || null;
  };

  const getAvatarForModel = (modelId: string): string | null => {
    // Check smart defaults mapping
    const avatarId = Object.keys(SMART_DEFAULTS).find(
      key => SMART_DEFAULTS[key] === modelId
    );
    
    if (avatarId) return avatarId;
    
    // For custom models, return a generic avatar ID
    return `custom-${modelId.split('/')[1]}`;
  };

  const clearAllKeys = () => {
    setState(DEFAULT_STATE);
    sessionStorage.removeItem(STORAGE_KEY);
  };

  // Register clear function with useAuth
  useEffect(() => {
    registerBYOKClear(clearAllKeys);
  }, []);

  return (
    <BYOKContext.Provider value={{
      openRouterKey: state.openRouterKey,
      selectedModels: state.selectedModels,
      activeModels: state.activeModels,
      avatarOrder: state.avatarOrder,
      storeKey: state.storeKey,
      setOpenRouterKey,
      clearOpenRouterKey,
      setSelectedModels,
      toggleModelActive,
      reorderAvatars,
      resetAvatarOrder,
      isModelActive,
      getModelForAvatar,
      getAvatarForModel
    }}>
      {children}
    </BYOKContext.Provider>
  );
};

export function useBYOK() {
  const context = useContext(BYOKContext);
  if (!context) {
    throw new Error('useBYOK must be used within BYOKProvider');
  }
  return context;
}
```

**Testing:**
- ✅ State persists across page refreshes
- ✅ `setSelectedModels` auto-activates new models
- ✅ `toggleModelActive` correctly toggles 🔑/🔒 state
- ✅ `reorderAvatars` updates `avatarOrder` array
- ✅ `resetAvatarOrder` restores default order

---

### Phase 3: Model Selection Dropdown Component (120 credits)

**File:** `src/components/ModelSelectionDropdown.tsx` (new)

**Objective:** Multi-select dropdown with provider grouping and search

**Code:**
```typescript
import { useState, useMemo } from 'react';
import { Check, ChevronsUpDown, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { 
  OPENROUTER_MODELS, 
  getModelsByProvider, 
  getProviderLogo,
  type OpenRouterModel 
} from '@/data/openRouterModels';

interface ModelSelectionDropdownProps {
  selectedModels: string[];
  onSelectionChange: (models: string[]) => void;
  disabled?: boolean;
  maxSelections?: number;
}

export function ModelSelectionDropdown({
  selectedModels,
  onSelectionChange,
  disabled = false,
  maxSelections = 6
}: ModelSelectionDropdownProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const groupedModels = useMemo(() => getModelsByProvider(), []);

  const filteredGroups = useMemo(() => {
    if (!searchQuery) return groupedModels;

    const filtered: Record<string, OpenRouterModel[]> = {};
    Object.entries(groupedModels).forEach(([provider, models]) => {
      const matchingModels = models.filter(
        m =>
          m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          m.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
          provider.toLowerCase().includes(searchQuery.toLowerCase())
      );
      if (matchingModels.length > 0) {
        filtered[provider] = matchingModels;
      }
    });
    return filtered;
  }, [groupedModels, searchQuery]);

  const toggleModel = (modelId: string) => {
    const isSelected = selectedModels.includes(modelId);
    if (isSelected) {
      onSelectionChange(selectedModels.filter(id => id !== modelId));
    } else {
      if (selectedModels.length >= maxSelections) {
        return; // Max selections reached
      }
      onSelectionChange([...selectedModels, modelId]);
    }
  };

  const selectedCount = selectedModels.length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
          disabled={disabled}
        >
          <span className="truncate">
            {selectedCount === 0
              ? 'Select models...'
              : `${selectedCount} model${selectedCount === 1 ? '' : 's'} selected`}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="start">
        <Command>
          <div className="flex items-center border-b px-3">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <input
              className="flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="Search models..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="max-h-[300px] overflow-y-auto p-1">
            {Object.keys(filteredGroups).length === 0 ? (
              <CommandEmpty>No models found.</CommandEmpty>
            ) : (
              Object.entries(filteredGroups).map(([provider, models]) => (
                <CommandGroup key={provider} heading={
                  <div className="flex items-center gap-2">
                    <span>{getProviderLogo(provider)}</span>
                    <span className="capitalize">{provider}</span>
                  </div>
                }>
                  {models.map((model) => {
                    const isSelected = selectedModels.includes(model.id);
                    return (
                      <CommandItem
                        key={model.id}
                        value={model.id}
                        onSelect={() => toggleModel(model.id)}
                        className="cursor-pointer"
                      >
                        <div className="flex items-center gap-2 flex-1">
                          <div
                            className={cn(
                              'mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary',
                              isSelected
                                ? 'bg-primary text-primary-foreground'
                                : 'opacity-50'
                            )}
                          >
                            {isSelected && <Check className="h-3 w-3" />}
                          </div>
                          <div className="flex-1">
                            <div className="font-medium">{model.name}</div>
                            {model.description && (
                              <div className="text-xs text-muted-foreground truncate">
                                {model.description}
                              </div>
                            )}
                          </div>
                          <Badge variant="outline" className="text-xs">
                            {model.tier}
                          </Badge>
                        </div>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              ))
            )}
          </div>
          <div className="border-t p-2 text-xs text-muted-foreground flex justify-between items-center">
            <span>Selected: {selectedCount}/{maxSelections}</span>
            {selectedCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onSelectionChange([])}
              >
                Clear all
              </Button>
            )}
          </div>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
```

**Testing:**
- ✅ Search filters models by name, ID, or provider
- ✅ Multi-select with checkboxes
- ✅ Max 6 selections enforced
- ✅ Provider grouping with logos
- ✅ "Clear all" button works
- ✅ Disabled state when no API key

---

### Phase 4A: Dynamic Avatar Panel (150 credits)

**File:** `src/components/AvatarList.tsx` (complete rewrite - base version without drag-and-drop)

**Objective:** Implement 3-state avatar logic (🔑/🔒/❌) without drag-and-drop

**Code:**
```typescript
import { Lock, Key, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SMART_DEFAULTS } from '@/data/openRouterModels';
import { useBYOK } from '@/hooks/useBYOK';

interface AvatarListProps {
  onAvatarClick: (avatarId: string) => void;
  userTier: 'free' | 'paid' | 'admin';
}

interface Avatar {
  id: string;
  src: string;
  name: string;
}

const DEFAULT_AVATARS: Avatar[] = [
  { id: 'chatgpt', src: '/images/avatars/chatgpt.png', name: 'ChatGPT' },
  { id: 'claude', src: '/images/avatars/claude.png', name: 'Claude' },
  { id: 'gemini', src: '/images/avatars/gemini.png', name: 'Gemini' },
  { id: 'grok', src: '/images/avatars/grok.png', name: 'Grok' },
  { id: 'llama', src: '/images/avatars/llama.png', name: 'Llama' },
  { id: 'mistral', src: '/images/avatars/mistral.png', name: 'Mistral' },
  { id: 'qwen', src: '/images/avatars/qwen.png', name: 'Qwen' },
  { id: 'phi', src: '/images/avatars/phi.png', name: 'Phi' },
  { id: 'gemma', src: '/images/avatars/gemma.png', name: 'Gemma' }
];

export function AvatarList({ onAvatarClick, userTier }: AvatarListProps) {
  const { 
    selectedModels, 
    activeModels, 
    openRouterKey,
    setSelectedModels,
    toggleModelActive,
    getModelForAvatar
  } = useBYOK();

  const isPaidOrAdmin = userTier === 'paid' || userTier === 'admin';
  const hasValidKey = !!openRouterKey;

  // Determine avatar state
  const getAvatarState = (avatarId: string): 'active' | 'silent' | 'not-selected' | 'locked' => {
    if (!isPaidOrAdmin || !hasValidKey) {
      return 'locked'; // Free users or no key → all locked
    }

    const modelId = getModelForAvatar(avatarId);
    if (!modelId) return 'not-selected';

    const isSelected = selectedModels.includes(modelId);
    if (!isSelected) return 'not-selected';

    const isActive = activeModels.includes(modelId);
    return isActive ? 'active' : 'silent';
  };

  const handleAvatarClick = (avatarId: string) => {
    const state = getAvatarState(avatarId);
    const modelId = getModelForAvatar(avatarId);

    if (state === 'locked') {
      // Show upgrade prompt
      onAvatarClick(avatarId);
      return;
    }

    if (state === 'not-selected' && modelId) {
      // Quick-add: add smart default to selected models
      setSelectedModels([...selectedModels, modelId]);
      return;
    }

    if (state === 'active' || state === 'silent') {
      // Toggle active/silent
      if (modelId) {
        toggleModelActive(modelId);
      }
    }
  };

  const renderStateIcon = (state: 'active' | 'silent' | 'not-selected' | 'locked') => {
    switch (state) {
      case 'active':
        return <Key className="h-4 w-4 text-green-500" />;
      case 'silent':
        return <Lock className="h-4 w-4 text-orange-500" />;
      case 'not-selected':
        return <X className="h-4 w-4 text-gray-400" />;
      case 'locked':
        return <Lock className="h-4 w-4 text-red-500" />;
    }
  };

  return (
    <div className="flex flex-col gap-4 p-4 bg-muted/30 rounded-lg min-h-[400px]">
      <h3 className="text-sm font-semibold text-muted-foreground">AI Agents</h3>
      <div className="grid grid-cols-3 gap-3">
        {DEFAULT_AVATARS.map((avatar) => {
          const state = getAvatarState(avatar.id);
          return (
            <button
              key={avatar.id}
              onClick={() => handleAvatarClick(avatar.id)}
              className={cn(
                'relative flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all',
                'hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary',
                state === 'active' && 'border-green-500 bg-green-50',
                state === 'silent' && 'border-orange-500 bg-orange-50',
                state === 'not-selected' && 'border-gray-300 bg-white opacity-60',
                state === 'locked' && 'border-red-300 bg-red-50 cursor-not-allowed'
              )}
              disabled={state === 'locked'}
            >
              <div className="relative">
                <img
                  src={avatar.src}
                  alt={avatar.name}
                  className="w-12 h-12 rounded-full object-cover"
                />
                <div className="absolute -top-1 -right-1 bg-white rounded-full p-0.5 shadow-sm">
                  {renderStateIcon(state)}
                </div>
              </div>
              <span className="text-xs font-medium text-center">{avatar.name}</span>
            </button>
          );
        })}
      </div>
      
      {/* Custom avatars (dynamic, appear when non-default models are selected) */}
      {selectedModels
        .filter(modelId => !Object.values(SMART_DEFAULTS).includes(modelId))
        .map(modelId => {
          const isActive = activeModels.includes(modelId);
          const modelName = modelId.split('/')[1]; // Extract model name from ID
          return (
            <button
              key={modelId}
              onClick={() => toggleModelActive(modelId)}
              className={cn(
                'relative flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all',
                'hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary',
                isActive ? 'border-green-500 bg-green-50' : 'border-orange-500 bg-orange-50'
              )}
            >
              <div className="relative">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-400 to-blue-500 flex items-center justify-center text-white font-bold text-lg">
                  {modelName[0].toUpperCase()}
                </div>
                <div className="absolute -top-1 -right-1 bg-white rounded-full p-0.5 shadow-sm">
                  {isActive ? <Key className="h-4 w-4 text-green-500" /> : <Lock className="h-4 w-4 text-orange-500" />}
                </div>
              </div>
              <span className="text-xs font-medium text-center">{modelName}</span>
            </button>
          );
        })}
    </div>
  );
}
```

**Testing:**
- ✅ Default avatars always visible
- ✅ Custom avatars appear when non-default models selected
- ✅ 🔑/🔒/❌ icons display correctly
- ✅ Quick-add works (clicking ❌ adds smart default)
- ✅ Toggle 🔑↔🔒 works
- ✅ Locked state for free users

---

### Phase 4B: Drag-and-Drop Avatar Ordering (120 credits)

**Objective:** Add drag-and-drop reordering to avatar panel with sequence badges

**Step 4B.1: Install DnD Library**
```bash
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

**Step 4B.2: Update `useBYOK` Hook**

Already implemented in Phase 2. Verify `avatarOrder`, `reorderAvatars`, `resetAvatarOrder` are present.

**Step 4B.3: Rewrite AvatarList with Drag-and-Drop**

**File:** `src/components/AvatarList.tsx` (replace Phase 4A code)

**Code:**
```typescript
import { Lock, Key, X, GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SMART_DEFAULTS } from '@/data/openRouterModels';
import { useBYOK } from '@/hooks/useBYOK';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface AvatarListProps {
  onAvatarClick: (avatarId: string) => void;
  userTier: 'free' | 'paid' | 'admin';
}

interface Avatar {
  id: string;
  src: string;
  name: string;
}

const DEFAULT_AVATARS: Avatar[] = [
  { id: 'chatgpt', src: '/images/avatars/chatgpt.png', name: 'ChatGPT' },
  { id: 'claude', src: '/images/avatars/claude.png', name: 'Claude' },
  { id: 'gemini', src: '/images/avatars/gemini.png', name: 'Gemini' },
  { id: 'grok', src: '/images/avatars/grok.png', name: 'Grok' },
  { id: 'llama', src: '/images/avatars/llama.png', name: 'Llama' },
  { id: 'mistral', src: '/images/avatars/mistral.png', name: 'Mistral' },
  { id: 'qwen', src: '/images/avatars/qwen.png', name: 'Qwen' },
  { id: 'phi', src: '/images/avatars/phi.png', name: 'Phi' },
  { id: 'gemma', src: '/images/avatars/gemma.png', name: 'Gemma' }
];

function SortableAvatar({
  avatar,
  state,
  sequenceNumber,
  onAvatarClick,
}: {
  avatar: Avatar;
  state: 'active' | 'silent' | 'not-selected' | 'locked';
  sequenceNumber?: number;
  onAvatarClick: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: avatar.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const renderStateIcon = () => {
    switch (state) {
      case 'active':
        return <Key className="h-4 w-4 text-green-500" />;
      case 'silent':
        return <Lock className="h-4 w-4 text-orange-500" />;
      case 'not-selected':
        return <X className="h-4 w-4 text-gray-400" />;
      case 'locked':
        return <Lock className="h-4 w-4 text-red-500" />;
    }
  };

  const sequenceEmojis = ['①', '②', '③', '④', '⑤', '⑥'];

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'relative flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all',
        'hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary',
        state === 'active' && 'border-green-500 bg-green-50',
        state === 'silent' && 'border-orange-500 bg-orange-50',
        state === 'not-selected' && 'border-gray-300 bg-white opacity-60',
        state === 'locked' && 'border-red-300 bg-red-50 cursor-not-allowed'
      )}
    >
      {/* Drag handle (only visible for selected avatars) */}
      {(state === 'active' || state === 'silent') && (
        <div
          {...attributes}
          {...listeners}
          className="absolute top-1 left-1 cursor-grab active:cursor-grabbing touch-none"
        >
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </div>
      )}

      {/* Sequence badge (only for selected avatars) */}
      {sequenceNumber !== undefined && (
        <div className="absolute top-1 right-1 bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold">
          {sequenceEmojis[sequenceNumber - 1] || sequenceNumber}
        </div>
      )}

      <button
        onClick={onAvatarClick}
        disabled={state === 'locked'}
        className="flex flex-col items-center gap-2 focus:outline-none"
      >
        <div className="relative">
          <img
            src={avatar.src}
            alt={avatar.name}
            className="w-12 h-12 rounded-full object-cover"
          />
          <div className="absolute -bottom-1 -right-1 bg-white rounded-full p-0.5 shadow-sm">
            {renderStateIcon()}
          </div>
        </div>
        <span className="text-xs font-medium text-center">{avatar.name}</span>
      </button>
    </div>
  );
}

export function AvatarList({ onAvatarClick, userTier }: AvatarListProps) {
  const {
    selectedModels,
    activeModels,
    avatarOrder,
    openRouterKey,
    setSelectedModels,
    toggleModelActive,
    reorderAvatars,
    resetAvatarOrder,
    getModelForAvatar,
  } = useBYOK();

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const isPaidOrAdmin = userTier === 'paid' || userTier === 'admin';
  const hasValidKey = !!openRouterKey;

  const getAvatarState = (avatarId: string): 'active' | 'silent' | 'not-selected' | 'locked' => {
    if (!isPaidOrAdmin || !hasValidKey) {
      return 'locked';
    }

    const modelId = getModelForAvatar(avatarId);
    if (!modelId) return 'not-selected';

    const isSelected = selectedModels.includes(modelId);
    if (!isSelected) return 'not-selected';

    const isActive = activeModels.includes(modelId);
    return isActive ? 'active' : 'silent';
  };

  const handleAvatarClick = (avatarId: string) => {
    const state = getAvatarState(avatarId);
    const modelId = getModelForAvatar(avatarId);

    if (state === 'locked') {
      onAvatarClick(avatarId);
      return;
    }

    if (state === 'not-selected' && modelId) {
      setSelectedModels([...selectedModels, modelId]);
      return;
    }

    if ((state === 'active' || state === 'silent') && modelId) {
      toggleModelActive(modelId);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = avatarOrder.indexOf(active.id as string);
    const newIndex = avatarOrder.indexOf(over.id as string);

    const newOrder = arrayMove(avatarOrder, oldIndex, newIndex);
    reorderAvatars(newOrder);
  };

  // Calculate sequence numbers (only for active avatars)
  const activeAvatarIds = avatarOrder.filter(id => {
    const state = getAvatarState(id);
    return state === 'active';
  });

  const getSequenceNumber = (avatarId: string): number | undefined => {
    if (getAvatarState(avatarId) !== 'active') return undefined;
    return activeAvatarIds.indexOf(avatarId) + 1;
  };

  // Get avatars in display order
  const orderedAvatars = avatarOrder.map(id => 
    DEFAULT_AVATARS.find(a => a.id === id)!
  );

  return (
    <div className="flex flex-col gap-4 p-4 bg-muted/30 rounded-lg min-h-[400px]">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-muted-foreground">AI Agents</h3>
        {activeAvatarIds.length > 0 && (
          <button
            onClick={resetAvatarOrder}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Reset Order
          </button>
        )}
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={avatarOrder} strategy={verticalListSortingStrategy}>
          <div className="grid grid-cols-3 gap-3">
            {orderedAvatars.map((avatar) => {
              const state = getAvatarState(avatar.id);
              const sequenceNumber = getSequenceNumber(avatar.id);
              return (
                <SortableAvatar
                  key={avatar.id}
                  avatar={avatar}
                  state={state}
                  sequenceNumber={sequenceNumber}
                  onAvatarClick={() => handleAvatarClick(avatar.id)}
                />
              );
            })}
          </div>
        </SortableContext>
      </DndContext>

      {/* Custom avatars (non-default models) */}
      {selectedModels
        .filter(modelId => !Object.values(SMART_DEFAULTS).includes(modelId))
        .map(modelId => {
          const isActive = activeModels.includes(modelId);
          const modelName = modelId.split('/')[1];
          return (
            <button
              key={modelId}
              onClick={() => toggleModelActive(modelId)}
              className={cn(
                'relative flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all mt-3',
                'hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary',
                isActive ? 'border-green-500 bg-green-50' : 'border-orange-500 bg-orange-50'
              )}
            >
              <div className="relative">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-400 to-blue-500 flex items-center justify-center text-white font-bold text-lg">
                  {modelName[0].toUpperCase()}
                </div>
                <div className="absolute -bottom-1 -right-1 bg-white rounded-full p-0.5 shadow-sm">
                  {isActive ? <Key className="h-4 w-4 text-green-500" /> : <Lock className="h-4 w-4 text-orange-500" />}
                </div>
              </div>
              <span className="text-xs font-medium text-center">{modelName}</span>
            </button>
          );
        })}
    </div>
  );
}
```

**Testing:**
- ✅ Drag-and-drop reorders avatars
- ✅ Sequence badges (①②③) appear on active avatars
- ✅ Grip handle visible on selected avatars
- ✅ "Reset Order" button restores default
- ✅ Drag state (semi-transparent, highlighted drop zones)

---

### Phase 5: Conference Page Updates (150 credits)

**File:** `src/pages/Conference.tsx` (major updates)

**Objective:** Integrate dropdown, route messages to Open Router in roundtable order

**Key Changes:**
1. Add `ModelSelectionDropdown` component
2. Remove multi-role selector
3. Update `handleSend` to send to all active models sequentially
4. Display responses with avatar labels

**Code Snippet (HandleSend Logic):**
```typescript
// File: src/pages/Conference.tsx

import { ModelSelectionDropdown } from '@/components/ModelSelectionDropdown';
import { useBYOK } from '@/hooks/useBYOK';

// ... existing imports and code

const Conference = () => {
  // ... existing state and hooks

  const { 
    openRouterKey, 
    selectedModels, 
    activeModels, 
    avatarOrder, 
    getModelForAvatar, 
    setSelectedModels, 
    toggleModelActive 
  } = useBYOK();

  const handleSend = async () => {
    if (!inputValue.trim() || !conversationId || isAiThinking) return;

    const messageContent = inputValue;
    setInputValue('');
    setIsAiThinking(true);

    // Get user tier
    const tier = userProfile?.tier || 'free';
    const isAdmin = tier === 'admin';
    const isPaid = tier === 'paid';

    // Check for valid Open Router key
    if (!isAdmin && !openRouterKey) {
      toast({
        title: 'API Key Required',
        description: 'Please add your Open Router API key in Settings to use paid models.',
        variant: 'destructive',
      });
      setIsAiThinking(false);
      return;
    }

    try {
      // Save user message
      const userMessage = await sendMessage({
        conversationId,
        content: messageContent,
        role: 'user',
        avatar_id: null,
      });

      // Determine which models to call (roundtable order)
      const modelsToCall = isAdmin
        ? ['gemini-2.5-flash'] // Admin uses Lovable AI Gateway
        : activeModels; // Paid users use selected Open Router models

      // Get ordered avatar IDs for display
      const orderedAvatarIds = avatarOrder.filter(id => {
        const modelId = getModelForAvatar(id);
        return modelId && modelsToCall.includes(modelId);
      });

      // Sequential calls to each model (roundtable)
      for (const avatarId of orderedAvatarIds) {
        const modelId = getModelForAvatar(avatarId);
        if (!modelId) continue;

        try {
          // Call edge function with selected model
          const response = await supabase.functions.invoke('ai-conference', {
            body: {
              messages: [{ role: 'user', content: messageContent }],
              selectedAvatar: avatarId,
              modelId: modelId, // Pass model ID for Open Router routing
              openRouterKey: isAdmin ? null : openRouterKey,
            },
          });

          if (response.error) {
            throw new Error(response.error.message);
          }

          const aiContent = response.data?.response?.choices?.[0]?.message?.content || 'No response';

          // Save agent response
          await sendMessage({
            conversationId,
            content: aiContent,
            role: 'assistant',
            avatar_id: avatarId,
          });

        } catch (error: any) {
          console.error(`[Conference] Error calling ${avatarId}:`, error);
          
          // Handle specific errors
          if (error.message.includes('429') || error.message.includes('rate limit')) {
            toast({
              title: `⚠️ ${avatarId} Rate Limited`,
              description: 'Model temporarily muted due to rate limit.',
              variant: 'destructive',
            });
            // Auto-mute this model
            toggleModelActive(modelId);
          } else {
            toast({
              title: `Error: ${avatarId}`,
              description: error.message || 'Failed to get response',
              variant: 'destructive',
            });
          }
        }
      }
    } catch (error) {
      console.error('[Conference] handleSend error:', error);
      toast({
        title: 'Error',
        description: 'Failed to send message',
        variant: 'destructive',
      });
    } finally {
      setIsAiThinking(false);
    }
  };

  // ... existing code

  return (
    <div className="conference-page">
      {/* ... existing layout */}

      {/* Add ModelSelectionDropdown above message input */}
      <div className="p-4 border-t space-y-4">
        <ModelSelectionDropdown
          selectedModels={selectedModels}
          onSelectionChange={setSelectedModels}
          disabled={!openRouterKey || !(userProfile?.tier === 'paid' || userProfile?.tier === 'admin')}
        />
        
        <div className="flex gap-2">
          <Textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder={
              userProfile?.tier === 'admin'
                ? 'Admin: Using Lovable AI Gateway (Gemini 2.5 Flash)'
                : !openRouterKey
                ? 'Add Open Router API key in Settings to get started'
                : 'Type your message...'
            }
            disabled={isAiThinking}
          />
          <Button onClick={handleSend} disabled={!inputValue.trim() || isAiThinking}>
            {isAiThinking ? <Loader2 className="animate-spin" /> : <Send />}
          </Button>
        </div>
      </div>
    </div>
  );
};
```

**Testing:**
- ✅ Dropdown appears above input
- ✅ Admin users see "Using Lovable AI Gateway" placeholder
- ✅ Sequential calls work (model 1 → model 2 → model 3)
- ✅ Responses display with avatar labels
- ✅ Rate limit auto-mutes model and shows toast

---

### Phase 6: Edge Function Updates (120 credits)

**File:** `supabase/functions/ai-conference/index.ts` (routing logic update)

**Objective:** Route requests to Open Router for paid users, preserve Lovable AI for admin

**Key Changes:**
```typescript
// File: supabase/functions/ai-conference/index.ts

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, selectedAvatar, modelId, openRouterKey } = await req.json();

    // Authenticate user
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if user is admin
    const isAdmin = user.email === 'marcaj777@gmail.com'; // 🚫 DO NOT MODIFY THIS

    // Determine API endpoint and key
    let endpoint: string;
    let apiKey: string;
    let requestBody: any;

    if (isAdmin) {
      // 🚫 ADMIN FLOW - DO NOT MODIFY
      endpoint = 'https://ai.gateway.lovable.dev/v1/chat/completions';
      apiKey = Deno.env.get('LOVABLE_API_KEY') || '';
      requestBody = {
        model: 'google/gemini-2.5-flash',
        messages: messages,
        stream: false,
      };
    } else {
      // 🆕 PAID USER FLOW - OPEN ROUTER
      if (!openRouterKey) {
        return new Response(JSON.stringify({ error: 'Open Router API key required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      endpoint = 'https://openrouter.ai/api/v1/chat/completions';
      apiKey = openRouterKey;
      requestBody = {
        model: modelId, // e.g., "openai/gpt-4o"
        messages: messages,
        stream: false,
      };
    }

    // Retry logic with exponential backoff
    const RETRY_BACKOFFS = [500, 1000, 2000];
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://syncteamai.lovable.app',
            'X-Title': 'SyncTeamAI',
          },
          body: JSON.stringify(requestBody),
        });

        if (response.ok) {
          const data = await response.json();
          return new Response(JSON.stringify({ response: data }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Handle rate limits
        if (response.status === 429) {
          if (attempt < 2) {
            const jitter = Math.random() * 200;
            await new Promise(r => setTimeout(r, RETRY_BACKOFFS[attempt] + jitter));
            continue;
          }
          return new Response(JSON.stringify({ error: 'Rate limit exceeded, please try again later.' }), {
            status: 429,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Other errors
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);

      } catch (error) {
        lastError = error as Error;
        if (attempt === 2) break;
        await new Promise(r => setTimeout(r, RETRY_BACKOFFS[attempt]));
      }
    }

    // All retries failed
    return new Response(JSON.stringify({ error: lastError?.message || 'Request failed' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[ai-conference] Error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
```

**Testing:**
- ✅ Admin requests route to Lovable AI Gateway
- ✅ Paid requests route to Open Router
- ✅ Retry logic works (3 attempts with backoff)
- ✅ 429 errors return proper error message
- ✅ Missing API key returns 400 error

---

### Phase 7: Settings Page Updates (80 credits)

**File:** `src/pages/Settings.tsx` (replace BYOK cards)

**Objective:** Single Open Router card with validate/save/revoke, remove WebLLM settings

**Code:**
```typescript
// File: src/pages/Settings.tsx

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { useBYOK } from '@/hooks/useBYOK';
import { Loader2, Key, Trash2 } from 'lucide-react';

export default function Settings() {
  const { toast } = useToast();
  const { openRouterKey, storeKey, setOpenRouterKey, clearOpenRouterKey, resetAvatarOrder } = useBYOK();
  
  const [keyInput, setKeyInput] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [shouldStore, setShouldStore] = useState(true);

  const maskedKey = openRouterKey
    ? `sk-or-••••••••${openRouterKey.slice(-4)}`
    : '';

  const handleValidate = async () => {
    if (!keyInput.trim()) {
      toast({
        title: 'Validation Error',
        description: 'Please enter an API key',
        variant: 'destructive',
      });
      return;
    }

    setIsValidating(true);
    try {
      // Test key with a simple request
      const response = await fetch('https://openrouter.ai/api/v1/models', {
        headers: {
          'Authorization': `Bearer ${keyInput}`,
        },
      });

      if (!response.ok) {
        throw new Error('Invalid API key');
      }

      // Save key
      setOpenRouterKey(keyInput, shouldStore);
      setKeyInput('');
      toast({
        title: 'Success',
        description: 'Open Router API key validated and saved',
      });
    } catch (error) {
      toast({
        title: 'Validation Failed',
        description: error instanceof Error ? error.message : 'Invalid API key',
        variant: 'destructive',
      });
    } finally {
      setIsValidating(false);
    }
  };

  const handleRevoke = () => {
    clearOpenRouterKey();
    setKeyInput('');
    toast({
      title: 'API Key Revoked',
      description: 'Your Open Router key has been removed',
    });
  };

  return (
    <div className="container max-w-4xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Manage your AI connections and preferences</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            Open Router API Key
          </CardTitle>
          <CardDescription>
            Connect your Open Router account to access 30+ AI models with a single key.
            Get your key at <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">openrouter.ai/keys</a>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {openRouterKey ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <div className="flex items-center gap-2">
                  <Key className="h-4 w-4 text-green-500" />
                  <span className="font-mono text-sm">{maskedKey}</span>
                </div>
                <Button variant="destructive" size="sm" onClick={handleRevoke}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Revoke
                </Button>
              </div>
              <div className="text-sm text-muted-foreground">
                ✅ Connected • Models available in Conference page dropdown
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <Label htmlFor="openrouter-key">API Key</Label>
                <Input
                  id="openrouter-key"
                  type="password"
                  placeholder="sk-or-v1-..."
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  disabled={isValidating}
                />
              </div>
              
              <div className="flex items-center space-x-2">
                <Switch
                  id="store-key"
                  checked={shouldStore}
                  onCheckedChange={setShouldStore}
                />
                <Label htmlFor="store-key" className="cursor-pointer">
                  Store key securely (recommended)
                </Label>
              </div>
              {!shouldStore && (
                <p className="text-xs text-muted-foreground">
                  Key will only be stored in your browser session. You'll need to re-enter it after logging out.
                </p>
              )}

              <Button onClick={handleValidate} disabled={isValidating || !keyInput.trim()}>
                {isValidating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Validating...
                  </>
                ) : (
                  'Validate & Save'
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Avatar Order</CardTitle>
          <CardDescription>
            Reset the roundtable response order to default (alphabetical)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={resetAvatarOrder}>
            Reset to Default Order
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
```

**Testing:**
- ✅ "Validate & Save" tests key before saving
- ✅ Masked key displays correctly
- ✅ "Revoke" button clears key
- ✅ "Don't store" toggle works
- ✅ "Reset Avatar Order" button works

---

### Phase 8: Remove WebLLM & Old BYOK (60 credits)

**Objective:** Comment out WebLLM code and remove old BYOK provider cards

**Files to Update:**
1. `src/pages/Conference.tsx` - Comment out WebLLM initialization and calls
2. `src/components/BYOKModal.tsx` - Remove individual provider inputs (or delete file)
3. `src/features/settings/ModelCacheSettings.tsx` - Comment out or delete

**Code Changes:**
```typescript
// File: src/pages/Conference.tsx

// ❌ WEBLLM REMOVED - Comment out these imports
// import { 
//   initializeWebLLM, 
//   generateWithWebLLM, 
//   isModelReady,
//   getModelState,
//   checkWebGPUSupport,
//   NotReadyError,
//   GPUUnsupportedError,
//   OOMError,
//   InitError
// } from "@/lib/ai/providers/webllmAdapter";

// ❌ WEBLLM REMOVED - Comment out free user flow in handleSend
// if (tier === 'free') {
//   // Show upgrade prompt instead of WebLLM
//   toast({
//     title: 'Upgrade Required',
//     description: 'Free tier has ended. Upgrade to paid plan to use AI models.',
//     variant: 'destructive',
//   });
//   return;
// }
```

**Testing:**
- ✅ WebLLM code paths no longer execute
- ✅ Free users see upgrade prompt
- ✅ Old BYOK modal removed

---

### Phase 9: UI Polish & Error Handling (60 credits)

**Objective:** Add loading states, error boundaries, and visual feedback

**Code:**
```typescript
// File: src/components/ModelSelectionDropdown.tsx

// Add loading state when fetching models
{isLoading && (
  <div className="p-4 text-center text-sm text-muted-foreground">
    Loading models...
  </div>
)}

// File: src/pages/Conference.tsx

// Add toast for successful model calls
toast({
  title: `✅ ${avatarId} Responded`,
  description: `Response received from ${getModelById(modelId)?.name}`,
});

// Add partial failure banner
{failedModels.length > 0 && failedModels.length < activeModels.length && (
  <Alert variant="warning" className="mb-4">
    <AlertTitle>Partial Results Available</AlertTitle>
    <AlertDescription>
      {failedModels.length} model(s) failed due to rate limits or errors. 
      <Button variant="link" onClick={() => retryFailedModels()}>
        Retry Failed Models
      </Button>
    </AlertDescription>
  </Alert>
)}
```

**Testing:**
- ✅ Loading spinners display correctly
- ✅ Success toasts appear after responses
- ✅ Partial failure banner shows when needed
- ✅ Error messages are user-friendly

---

### Phase 10: Testing & QA (100 credits)

**Objective:** Comprehensive end-to-end testing

**Test Scenarios:**

1. **Admin Flow (Lovable AI Gateway)**
   - ✅ Log in as `marcaj777@gmail.com`
   - ✅ Verify "Using Lovable AI Gateway" placeholder
   - ✅ Send message → Gemini 2.5 Flash responds
   - ✅ No Open Router key required

2. **Paid User Flow (Open Router)**
   - ✅ Log in as paid user
   - ✅ Add Open Router API key in Settings
   - ✅ Select 3 models in dropdown (GPT-4o, Claude Opus 4, Gemini 2.5 Pro)
   - ✅ Verify avatars show 🔑①②③ badges
   - ✅ Send message → All 3 models respond in order
   - ✅ Drag Gemini to position 1 → Next message, Gemini responds first

3. **Free User Flow (Upsell)**
   - ✅ Log in as free user
   - ✅ All avatars show 🔒 lock icons
   - ✅ Click send → "Upgrade Required" toast appears

4. **Dropdown Behavior**
   - ✅ Search filters models correctly
   - ✅ Max 6 selections enforced
   - ✅ "Clear all" button works
   - ✅ Provider grouping displays correctly

5. **Avatar Panel Behavior**
   - ✅ Default avatars always visible
   - ✅ Custom avatars appear when non-default models selected
   - ✅ Clicking ❌ quick-adds smart default
   - ✅ Clicking 🔑 toggles to 🔒
   - ✅ Removing model from dropdown → default avatar reverts to ❌, custom avatar disappears

6. **Drag-and-Drop**
   - ✅ Dragging avatar updates order
   - ✅ Sequence badges update
   - ✅ Roundtable order follows drag sequence
   - ✅ "Reset Order" button restores default

7. **Error Handling**
   - ✅ Invalid API key → validation fails
   - ✅ Rate limit (429) → model auto-mutes, toast appears
   - ✅ Network error → error toast displays
   - ✅ Partial failure → banner with retry option

8. **Persistence**
   - ✅ Selected models persist across page refreshes
   - ✅ Avatar order persists across page refreshes
   - ✅ API key persists (if "store" toggle is ON)

---

## 🎯 Acceptance Criteria

**Definition of "Done":**

1. ✅ **Settings Page**
   - Single Open Router BYOK card
   - Validate & Save button tests key
   - Revoke button clears key
   - "Don't store" toggle works
   - WebLLM settings removed

2. ✅ **Conference Page**
   - Model selection dropdown displays 25-30 curated models
   - Dynamic avatar panel with 🔑/🔒/❌ states
   - Drag-and-drop reordering with sequence badges
   - Quick-add works (clicking ❌)
   - Roundtable responses follow drag order

3. ✅ **Admin Flow Preserved**
   - Hardcoded email check still works
   - Lovable AI Gateway routing unchanged
   - No Open Router key required for admin

4. ✅ **Paid User Flow**
   - Open Router integration works
   - Sequential streaming per model
   - Retry logic handles 429 errors
   - Auto-mute on persistent failure

5. ✅ **Free User Flow**
   - All avatars locked
   - Upgrade prompt on send
   - No WebLLM code paths execute

6. ✅ **Code Quality**
   - No TypeScript errors
   - All tests pass
   - No console errors
   - Performance: initial load <2s, message send <3s per model

---

## 📋 Out of Scope (Phase 11+)

**Explicitly deferred to future phases:**

1. ❌ Parallel SSE multiplexed streaming
2. ❌ Nightly Open Router catalog sync job
3. ❌ Model discovery UI ("Show more" button)
4. ❌ Speed/Cost/Context filters on dropdown
5. ❌ User roles refactor (`user_roles` table migration)
6. ❌ Admin dashboard for model management
7. ❌ Table partitioning / read replicas
8. ❌ Message archival strategy

**Rationale:** These features add 300+ credits and require careful planning. Implementing them now would exceed the 920-1020 budget and increase risk of breaking existing functionality.

---

## 🔒 Security & Performance Requirements

**CRITICAL: Non-Negotiable Requirements**

### Security
- ✅ **API keys never logged** to console or error messages
- ✅ **RLS policies** enforce user isolation on `user_api_keys` table
- ✅ **Envelope encryption** for stored API keys (per-user data key + server secret)
- ✅ **No client-side role checks** (always use server-side `tier` validation)
- ✅ **Input validation** on all user inputs (model IDs, API keys, message content)

### Performance
- ✅ **Sequential calls with retry** (exponential backoff + jitter)
- ✅ **Max 6 models per round** (enforced in dropdown)
- ✅ **Lazy-load heavy components** (dropdown, avatar panel)
- ✅ **sessionStorage for state** (no unnecessary re-renders)
- ✅ **Token count < 100K per round** (prevent context overflow)

### Scale
- ✅ **Parallel calls future-ready** (architecture supports Phase 11+ upgrade)
- ✅ **Pagination on conversations/messages** (already implemented)
- ✅ **Indexed foreign keys** (from Phase 0 scalability audit)

---

## 📦 Deliverable Format

**What to provide upon completion:**

1. **GitHub Commit Message:**
   ```
   feat: Implement Open Router BYOK with drag-and-drop avatar ordering

   - Add ModelSelectionDropdown with 30 curated models
   - Rewrite AvatarList with 3-state logic (🔑/🔒/❌)
   - Implement drag-and-drop ordering with sequence badges
   - Update Conference page for sequential roundtable responses
   - Route paid users to Open Router, preserve admin Lovable AI flow
   - Replace multi-BYOK cards with single Open Router card in Settings
   - Remove WebLLM code paths (commented out for future reference)
   - Add retry logic with exponential backoff for 429 errors
   - Create user_api_keys table with envelope encryption
   - Update useBYOK hook for Open Router state management

   Closes #[issue-number]
   Credit estimate: 920-1020 credits
   ```

2. **Testing Evidence:**
   - Screenshots of:
     - Settings page with Open Router card
     - Conference page with dropdown + drag-and-drop panel
     - Admin flow (Lovable AI Gateway working)
     - Paid flow (Open Router responses)
   - Video recording of:
     - Drag-and-drop reordering
     - Roundtable sequence (model 1 → model 2 → model 3)

3. **Documentation:**
   - Update `docs/user-guide.md` with:
     - How to get Open Router API key
     - How to select models
     - How to reorder avatars
     - What roundtable order means
   - Update `README.md` with Open Router integration notes

4. **Known Issues (if any):**
   - List any edge cases or limitations discovered during testing
   - Propose fixes for Phase 11+

---

## 📚 User Documentation

### How to Use Roundtable Ordering

**What is Roundtable Ordering?**

Roundtable ordering lets you control the sequence in which AI models respond to your messages. Instead of all models responding at once, they respond one after another in the order you choose.

**How to Reorder Avatars:**

1. **Select your models** from the dropdown above the message input
2. **Active avatars** (marked with 🔑 and sequence badges ①②③) appear in the avatar panel
3. **Drag any avatar** to reorder them
4. The **sequence badges** (①②③) update automatically to show the new order
5. When you send a message, models respond in this exact sequence

**Example:**

```
Original order: ChatGPT ①, Claude ②, Gemini ③

You drag Gemini to the top.

New order: Gemini ①, ChatGPT ②, Claude ③

Next message:
→ Gemini responds first
→ ChatGPT responds second
→ Claude responds third
```

**Tips:**

- Use the **"Reset Order"** button to restore alphabetical order
- **Silent models** (🔒) won't respond but stay in your selection
- Click the **X icon** on default avatars to quick-add them to your selection

---

## 📞 Questions? Contact Project Owner

**If you encounter ANY ambiguity or need clarification:**

1. **DO NOT** make assumptions about admin logic, role systems, or security architecture
2. **DO NOT** refactor code outside the scope of these 10 phases
3. **ASK** the project owner (Marc) via GitHub issues or Lovable chat

**Remember:** This is Marc's project. When in doubt, preserve existing functionality and ask.

---

## 🚀 Implementation Order

**Execute phases sequentially:**

1. Phase 1: Model data file (80 credits)
2. Phase 2: useBYOK hook update (100 credits)
3. Phase 3: Dropdown component (120 credits)
4. Phase 4A: Avatar panel (150 credits)
5. **Phase 4B: Drag-and-drop (120 credits)** ← Fully integrated
6. Phase 5: Conference page (150 credits)
7. Phase 6: Edge function (120 credits)
8. Phase 7: Settings page (80 credits)
9. Phase 8: Remove WebLLM (60 credits)
10. Phase 9: UI polish (60 credits)
11. Phase 10: Testing (100 credits)

**Total:** 920-1020 credits

---

## 🎉 Success Metrics

**How to know you succeeded:**

- ✅ Paid users can select models from dropdown
- ✅ Drag-and-drop reordering works smoothly
- ✅ Roundtable order matches drag sequence
- ✅ Admin flow still uses Lovable AI Gateway
- ✅ All tests pass
- ✅ No TypeScript errors
- ✅ Performance: <3s per model response

**When all criteria are met, this handover is complete. Notify project owner for final review.**

---

**END OF HANDOVER DOCUMENT**
