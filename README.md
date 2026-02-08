# SyncTeamAI Conference (Next.js)

Multi-agent "AI Conference" web app built with Next.js (App Router), React, TypeScript, Tailwind, and shadcn/ui. It uses Supabase for data + auth (magic link) and a Next.js server route for OpenRouter generation.

## Features

- "Conference" UI that runs multiple agents sequentially per round
- BYOK (bring your own key) support for OpenRouter models
- Server-side OpenRouter boundary (`app/api/ai/generate/route.ts`)
- Server-side rate limiting, concurrency caps, and idempotency controls
- Supabase-backed conversations, prompts, and usage accounting (see `supabase/migrations/`)
- Auth via Supabase magic links (`supabase.auth.signInWithOtp`)

## Tech Stack

- Next.js 14 (App Router), React 18, TypeScript
- Tailwind + shadcn/ui + lucide-react
- Supabase (`@supabase/supabase-js`)
- Next.js Route Handlers (`app/api/**`)
- OpenRouter (API key via env or BYOK)

## Getting Started

Prereqs:

- Node.js + npm

Install:

```bash
npm install
```

Environment:

- Copy `.env.example` to `.env.local`
- Fill in at least:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Run dev server (port 8080):

```bash
npm run dev
```

Build + run:

```bash
npm run build
npm run start
```

## Environment Variables

See `.env.example` for the full list.

- Client-exposed (safe to expose): `NEXT_PUBLIC_*`
- Server-only (do not prefix with `NEXT_PUBLIC_`): e.g. `BYOK_ENCRYPTION_KEY`, `OPENROUTER_BASE_URL`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `TRUST_PROXY_HEADERS`

Do not commit secrets. This repo ignores `.env` and `*.local` by default.

## Repository Layout

- `app/` - Next.js App Router pages
- `src/` - UI components, views, hooks, and integrations
- `supabase/` - migrations, Edge Functions, and config

## Common Scripts

- `npm run dev` - local dev server on port 8080
- `npm run lint` - ESLint
- `npm run typecheck` - TypeScript typecheck
- `npm test` - Vitest (runs even if no tests)
