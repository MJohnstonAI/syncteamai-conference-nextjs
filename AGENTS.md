# AGENTS.md — SYNCTEAMAI-CONFERENCE

## Overview
Multi-agent “AI Conference” web app. Vite + React + TypeScript + Tailwind (+ shadcn/ui). Supabase (RLS) for data. Clerk for auth. OpenRouter for models (BYOK optional).

## Exact Stack
- Frontend: Vite, React 18, TypeScript, Tailwind, shadcn/ui, lucide-react
- Auth: Clerk (`useAuth().userId`)
- Data: Supabase (PostgREST + **Row Level Security**)
- Server Surface: **Supabase Edge Functions** (primary)
- Models: OpenRouter (BYOK; **never persist raw keys**)

## Key Paths (stability contracts)
- Conference UI/logic: `src/pages/Conference.tsx`
- BYOK state: `src/hooks/BYOKProvider.tsx`
- Prompts CRUD: `src/hooks/usePrompts.tsx`
- Clerk→Supabase bridge: `src/integrations/clerk/SupabaseTokenProvider.tsx`

## Auth Bridge Contract
- Browser: `supabase-js` with `Authorization: Bearer <ClerkJWT>` header on all requests.
- Supabase: verify **External JWT** (Clerk JWKS). If not available, do writes via Edge Function using service role **after** server-side token verification.
- **Do not** call `supabase.auth.getUser()` in the browser; use `useAuth().userId` for `user_id` columns.

## Roles & Billing
- New users default to **`pending`**.
- Promotion to `paid`/`admin` only via billing webhook or admin tool. No implicit elevation in client/migrations.

## BYOK Rules
- Only persist **metadata** (`provider`, `last4`) when `storeKey === true`.
- If storage is disabled, **scrub immediately**. Never log or persist raw keys.

## Conferencing Semantics
- **Sequential** per round. After each agent’s reply, **append** it to the working `messages[]` before calling the next agent so later agents can cite earlier turns.

## Usage Accounting (tables; create if missing)
- `conference_runs(id, user_id, template_id, started_at, finished_at, total_tokens, total_cost_cents)`
- `conference_messages(id, run_id, role, model_id, content, tokens_prompt, tokens_completion, created_at)`
- `turn_usage_events(id, run_id, model_id, tokens_prompt, tokens_completion, unit_price_usd, cost_cents, latency_ms, created_at)`

## RLS Shape (owner-only default)
```sql
-- Example pattern (adapt to each table)
alter table public.saved_prompts enable row level security;

create policy "owner read/write" on public.saved_prompts
for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Demo templates readable by all authenticated
create policy "demo readable" on public.saved_prompts
for select using (is_demo = true);

-user_roles.id: permanent internal UUID, used for auditing/billing.
-user_roles.user_id: active owner UUID, referenced by groups.user_id, -saved_prompts.user_id, conversations.user_id, and intentionally reassignable.
-user_roles.clerk_user_id: external auth mapping.