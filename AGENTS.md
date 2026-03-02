# AGENTS.md

## Cursor Cloud specific instructions

### Overview

This is **Cornerstone OS** (`otc-media`), an AI-powered newsroom engine built with Next.js 16 (App Router) + TypeScript. It automates an editorial pipeline for the "Identity Jedi Newsletter" — ingesting RSS feeds, generating editorial leads via Claude, and drafting newsletter issues.

### Running the app

- **Dev server:** `npm run dev` (port 3000)
- **Lint:** `npx eslint .` (pre-existing warnings/errors in the codebase are expected)
- **Build:** `npm run build`

### Required environment variables

All five must be present in `.env.local` (or as shell env vars) for the app to function:

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase anon/public key |
| `SUPABASE_SECRET_KEY` | Supabase service-role key |
| `ANTHROPIC_API_KEY` | Anthropic Claude API key |
| `WORKSPACE_ID` | UUID scoping all DB queries |

The update script writes `.env.local` from injected env vars on every startup.

### Architecture notes

- Single Next.js app — no Docker, no microservices, no monorepo tooling.
- All persistence is via a **remote Supabase** instance (no local DB, no migrations to run).
- AI features (lead generation, draft generation) call the Anthropic API and require a valid key + Supabase tables to already exist.
- No test framework is configured in the repository. `npm test` is not available.

### Key pages

| Route | Description |
|---|---|
| `/` | RSS ingest + signals list |
| `/leads` | Editorial lead generation and approval |
| `/issues` | Newsletter issue draft generation |
| `/research` | Research console with directives and runs |
