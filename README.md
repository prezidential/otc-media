# Cornerstone OS

AI-powered newsroom engine by [OnTheCorner Media](https://github.com/prezidential/otc-media). Cornerstone automates the editorial pipeline for the **Identity Jedi Newsletter** — from research ingestion through draft generation — so the editor starts with a structured, voice-consistent draft instead of a blank page.

## What It Does

| Stage | Description |
|-------|-------------|
| **Research** | Ingests RSS feeds across 8 directives (Identity + AI, Agentic AI Security, CIEM, ITDR, etc.) covering 13+ cybersecurity sources |
| **Leads** | Generates editorial leads from signals via role-configured LLM calls, with citation enforcement and human approval workflow |
| **Drafting** | Produces full newsletter issues (Title, Hook, Fresh Signals, Deep Dive, Dojo Checklist, Promo, Close) with thesis-driven editorial angles |
| **Revision** | Regenerates individual sections with lint guardrails and editorial bias injection |
| **Outlines** | Manages workspace-scoped content outlines (newsletter + Insider Access) for generation structure |

## Tech Stack

- **Framework:** Next.js 16 (App Router, TypeScript)
- **AI:** Pluggable Anthropic/OpenAI via `lib/llm/provider.ts` (default: Claude Sonnet)
- **Database:** Supabase (hosted PostgreSQL)
- **UI:** Tailwind CSS v4, Lucide React, JetBrains Mono
- **Testing:** Vitest

## Getting Started

### Prerequisites

- Node.js 20+
- A Supabase project with required tables (at minimum apply `lib/supabase/schema-issue_drafts.sql` and `lib/supabase/schema-content-outlines.sql`; add `lib/supabase/schema-brainstorm.sql` for the **Brainstorming Hub**; see `lib/supabase/` for additional schemas)
- An Anthropic API key (and OpenAI API key if any role uses OpenAI)

### Environment Variables

Create `.env.local` in the project root:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-anon-key
SUPABASE_SECRET_KEY=your-service-role-key
ANTHROPIC_API_KEY=your-anthropic-key
OPENAI_API_KEY=your-openai-key
# Phase 2A multi-tenancy: this UUID is the legacy default workspace; routes that
# haven't yet been migrated to supabaseUser() still read it. Once every route is
# migrated and a real workspace exists in the `workspaces` table, this can be
# removed (the cron/orchestrator code paths will be cut over in M1).
WORKSPACE_ID=your-workspace-uuid
LLM_PROVIDER=anthropic
LLM_MODEL=claude-sonnet-4-20250514
LLM_RESEARCH=anthropic:claude-sonnet-4-20250514
LLM_LEADS=anthropic:claude-sonnet-4-20250514
LLM_EDITOR=anthropic:claude-sonnet-4-20250514
LLM_DRAFTING=anthropic:claude-sonnet-4-20250514
LLM_REVISION=anthropic:claude-sonnet-4-20250514
LLM_LINT=anthropic:claude-sonnet-4-20250514
LLM_LINKEDIN=anthropic:claude-sonnet-4-20250514
LLM_BRAINSTORM=anthropic:claude-sonnet-4-20250514
BEEHIIV_ENABLED=false
BEEHIIV_API_KEY=your-beehiiv-api-key
BEEHIIV_PUBLICATION_ID=your-beehiiv-publication-id

# Optional — Issues → Phase 2 → Podcast script → Download MP3 (ElevenLabs)
ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_ID=
# ELEVENLABS_MODEL_ID=eleven_multilingual_v2

# Optional — when set, Download MP3 also inserts podcast_episodes + uploads to this Storage bucket (private bucket recommended)
PODCAST_AUDIO_STORAGE_BUCKET=podcast-audio
```

Notes:

- Beehiiv variables are optional unless you plan to push drafts directly to Beehiiv.
- ElevenLabs variables are optional; without them, **Download MP3** on the Issues content-products panel returns a configuration error.
- **PODCAST_AUDIO_STORAGE_BUCKET:** create the bucket in Supabase Storage (same name as this value). With a **saved** issue draft, TTS download persists script + MP3 (`podcast_episodes` + `audio_storage_*`). In-memory-only drafts skip persistence (no `draftId`).
- `OPENAI_API_KEY` is required only when `LLM_PROVIDER=openai` or any `LLM_<ROLE>` uses `openai:<model>`.
- Per-role LLM variables are optional overrides; unset roles fall back to `LLM_PROVIDER` + `LLM_MODEL`.

### Install & Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### First-Time Setup

1. **Seed brand profile:** `POST /api/brand-profiles/seed` (creates the Identity Jedi Newsletter profile)
2. **Seed directives:** `POST /api/research/seed-directives` (creates the 8 research directives)
3. **Seed revenue items:** `POST /api/revenue/seed` (creates default promo items)
4. **(Optional) Seed default outlines:** `POST /api/content-outlines/seed`, or on Issues use "Seed default outlines" when the workspace has no `content_outlines` rows yet
5. **Ingest signals:** Go to Research → click "Run All Directives"
6. **Generate leads:** Go to Leads → select brand profile → click "Generate Leads"
7. **Approve leads:** Review and approve leads on the Leads page
8. **Generate draft:** Go to Issues → configure steering, output mode, and outlines → click "Generate Issue Draft"
9. **Publish (optional):** Use "Export HTML" or enable Beehiiv and use "Push to Beehiiv"

## Auth + Multi-Tenancy (Phase 2A — M0)

Cornerstone OS uses Supabase Auth + Postgres Row-Level Security for the
authorization boundary. See spec v2.9 §3.16 for the full model.

Three-layer model:
1. **Authentication** — Supabase Auth (email + password today, OAuth in M2).
2. **Workspace binding** — `workspaces` and `workspace_members` tables; one user
   can belong to many workspaces, each with `owner` / `editor` / `viewer` role.
3. **Per-query enforcement** — every user-facing route runs through `supabaseUser()`
   under the `authenticated` Postgres role; RLS policies built around the
   `public.user_in_workspace(uuid)` helper restrict every read/write to the active
   workspace.

Service-role client (`supabaseAdmin()`) is reserved for cron, webhook, and
orchestrator contexts that have no user JWT. Service-role callers bypass RLS and
must filter by `workspace_id` explicitly.

### One-time SQL setup (in this order)

In the Supabase SQL editor, run:

1. Paste + run `lib/supabase/schema-tenancy.sql` — creates the
   `workspaces`, `workspace_members`, `workspace_invites` tables, the
   `public.user_in_workspace()` helper, and RLS policies on those three tables.
2. Open `lib/supabase/schema-tenancy-backfill.sql`, replace the placeholder
   UUID on the `ws_id :=` line with your `WORKSPACE_ID` env value, paste +
   run. This binds every existing `auth.users` row to a "default" workspace
   so the legacy data keeps working.
3. Paste + run `lib/supabase/schema-rls-wave1.sql` — turns on RLS for the
   wave-1 tables (signals, editorial_leads, issue_drafts, content_outlines,
   brand_profiles, workspace_settings, runs).

### Auth flow

- `/sign-in` and `/sign-up` use `supabaseBrowser` for email + password.
- Middleware (`middleware.ts`) refreshes the Supabase session on every request,
  redirects unauthenticated traffic to `/sign-in?next=...`, and redirects
  signed-in users with no workspaces to `/onboarding`.
- `/onboarding` collects a workspace name + slug and POSTs to `/api/workspaces`,
  which creates the workspace, adds the user as `owner`, and sets the
  `cs_active_workspace` cookie.
- The studio sidebar shows the active workspace, role, and a sign-out button.

### Workspace + invite endpoints

| Endpoint | Description |
|---|---|
| `GET  /api/me` | Current user, every workspace they belong to, active workspace id |
| `POST /api/workspaces` | Create a workspace, become its owner, set active cookie |
| `POST /api/workspaces/active` | Switch the active workspace (RLS-gated) |
| `GET/POST/DELETE /api/workspaces/[id]/members` | List members + invites; create invite token; remove member (owner-only via RLS) |
| `GET  /api/workspaces/invites/[token]` | Public invite landing — redirects to /sign-in then accepts the invite |

Email delivery for invites is intentionally out of scope for M0; owners copy the
invite URL and share it manually until M1 wires SMTP.

### Migration status (M0)

- Migrated to `supabaseUser()` + `requireWorkspace()`:
  `/api/dashboard/stats`, `/api/search`, `/api/signals/list`, `/api/issues/list`,
  `/api/brand-profiles/list`.
- Every other workspace-scoped route still uses `supabaseAdmin()` with
  `process.env.WORKSPACE_ID` and continues to work because service-role bypasses
  RLS. Wave-2 rollout converts those routes and ships
  `schema-rls-wave2.sql`.

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server (port 3000) |
| `npm run build` | Production build |
| `npm run lint` | Run ESLint |
| `npm test` | Run Vitest test suite |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:coverage` | Run tests with V8 coverage |

## Project Structure

```
app/
├── components/          # Sidebar, page header
├── page.tsx             # Signals (homepage)
├── research/page.tsx    # Research console
├── leads/page.tsx       # Editorial leads
├── issues/page.tsx      # Issue draft generation
├── outlines/page.tsx    # Content outlines CRUD UI
└── api/
    ├── ingest/rss/          # Single RSS feed ingest
    ├── research/            # Directives, run-directives, run-all
    ├── leads/               # Generate, list, approve
    ├── issues/              # Generate, latest, regenerate-section
    ├── content-outlines/    # List/create/seed; [id] get/patch/delete (soft-disable)
    ├── brand-profiles/      # List, seed
    ├── revenue/             # List, seed, recommend
    ├── publish/             # Status, HTML export, Beehiiv draft push
    ├── signals/list/        # List captured signals
    ├── pipeline/run/        # Autonomous Researcher → Writer → Editor run
    └── runs/list/           # List ingest/generation runs

lib/
├── draft/               # DraftObject type, renderer, lint, parser
├── content-outlines/    # Outline specs, validation, resolution, access checks
├── leads/               # Zod schema for lead validation
├── llm/                 # Provider abstraction + role-based model selection
├── research/            # RSS feed map (8 directives, 13+ sources)
├── supabase/            # Server + browser clients
└── utils.ts             # cn() utility

__tests__/               # Vitest tests (unit + API route)
docs/                    # System specification (v2.3)
```

## Architecture

See [`docs/cornerstone-system-spec-v2.md`](docs/cornerstone-system-spec-v2.md) for the current system specification including design principles, architecture details, guardrails, and roadmap.

## Content Outlines Runbook

`content_outlines` controls structure and prompt templates for issue generation.

- **Brand profile** = voice and writing constraints.
- **Content outline** = artifact structure and prompt template (`newsletter_issue` or `insider_access`).
- Disabled outlines are soft-disabled (`disabled_at` set), excluded from default list responses, and cannot be used for generation.

### Seed Defaults

`POST /api/content-outlines/seed` inserts one default outline per kind only when the workspace has zero outline rows.

```bash
curl -s -X POST http://localhost:3000/api/content-outlines/seed
```

If rows already exist, it returns `inserted: 0` and does not overwrite anything.

### Manage Outlines API

| Path | Method | Purpose |
|------|--------|---------|
| `/api/content-outlines` | `GET` | List outlines (active only by default) |
| `/api/content-outlines?includeDisabled=1` | `GET` | Include soft-disabled outlines |
| `/api/content-outlines` | `POST` | Create outline from structured fields (no raw `spec_json` input) |
| `/api/content-outlines/[id]` | `GET` | Fetch a single outline (including disabled) |
| `/api/content-outlines/[id]` | `PATCH` | Update active outline (`kind` immutable) |
| `/api/content-outlines/[id]` | `DELETE` | Soft-disable outline (`disabled_at` set, `is_default` cleared) |

`POST` and `PATCH` return `{ outline, warnings }`. Warnings are non-blocking checks (for example missing placeholders like `{{PRIMARY_THESIS}}`).

### Create Outline (example `curl`)

```bash
curl -s -X POST http://localhost:3000/api/content-outlines \
  -H "Content-Type: application/json" \
  -d '{
    "name":"Default newsletter issue",
    "kind":"newsletter_issue",
    "is_default":true,
    "userPromptTemplate":"... {{PRIMARY_THESIS}} ... {{STEERING_BLOCK}} ... {{ANGLE_BLOCK}} ... {{LEADS_BLOCK}} ... {{PROMO_TEXT}} ...",
    "systemPromptSuffix":"..."
  }'
```

For `kind: insider_access`, use `insiderSystemPrompt` instead of `systemPromptSuffix`.

### Issues Generation + Outline Resolution

`POST /api/issues/generate` supports:

- `outputMode`: `full_issue` | `insider_access` | `bundle`
- `contentOutlineId`: optional newsletter outline id (for `full_issue`/`bundle`)
- `insiderContentOutlineId`: optional Insider outline id (for `insider_access`/`bundle`)
- `sourceDraftId`: optional source issue draft id (for `insider_access` mode)

Resolution behavior:

- If outline id is provided, generation enforces: outline exists, is not disabled, and matches expected kind.
- If no id is provided, generation resolves workspace default outline for that kind; if none exists, it falls back to built-in defaults from `lib/content-outlines/default-specs.ts`.

### Output Mode Behavior

| Mode | Result |
|------|--------|
| `full_issue` | Public issue draft only |
| `insider_access` | Insider artifact only (from approved leads, or from `sourceDraftId` when provided) |
| `bundle` | Public issue + Insider artifact in one generation run |

### Operational Notes

- Issues page dropdowns load active outlines only (`GET /api/content-outlines`).
- Use `/outlines` to create/edit/disable templates and inspect warnings for missing placeholders.

### Troubleshooting

- `400 brandProfileId required`: request body omitted `brandProfileId`.
- `400 No approved leads available...`: approve leads before generating.
- `404 Outline not found.`: provided outline id is invalid for this workspace.
- `400 This outline is disabled...`: provided outline is soft-disabled.
- `400 Outline kind does not match this operation.`: used Insider id where newsletter id is expected (or vice versa).
- `400 insiderSystemPrompt is required for insider_access`: missing Insider system prompt on create/update.
- `404 Draft not found or issue content is invalid for Insider generation.`: `sourceDraftId` row missing or has invalid/non-structured `content_json`.
- Outlines list empty in Issues UI: generation still works via built-in defaults; seed or create DB rows if you want explicit editable templates.

## Autonomous Pipeline Runbook

The pipeline endpoint runs the agent sequence (`researcher` → `writer` → `editor`) and records each stage result.

### Endpoint

`POST /api/pipeline/run`

Request body (all optional):

- `stages`: array of stages to run. Defaults to `["researcher","writer","editor"]`.
- `triggered_by`: audit label for run provenance. Defaults to `"manual"`.

```bash
curl -s -X POST http://localhost:3000/api/pipeline/run \
  -H "Content-Type: application/json" \
  -d '{"triggered_by":"manual","stages":["researcher","writer","editor"]}'
```

Response includes:

- `ok`: `true` only when all executed stages succeed.
- `aborted`: whether execution stopped early after a failed stage.
- `stages`: per-stage `success`, `summary`, `decisions`, and `data`.

Operational constraints:

- `WORKSPACE_ID` must be configured.
- `writer` and `editor` require an existing brand profile in `brand_profiles` for the workspace.

## Publishing Runbook

### Publish Paths

| Path | Method | Purpose |
|------|--------|---------|
| `/api/publish/status` | `GET` | Returns publish capability flags used by the Issues UI |
| `/api/publish/export-html` | `POST` | Returns rendered HTML from `issue_drafts.content_json` |
| `/api/publish/beehiiv` | `POST` | Pushes a draft post to Beehiiv when integration is enabled |

### Capability Check

`/api/publish/status` always reports HTML export as available. Beehiiv reports enabled only when all of these are true:

- `BEEHIIV_ENABLED=true`
- `BEEHIIV_API_KEY` is set
- `BEEHIIV_PUBLICATION_ID` is set

```bash
curl -s http://localhost:3000/api/publish/status
```

```json
{
  "beehiiv": false,
  "export_html": true
}
```

### Export HTML

Use after generating and saving a draft:

```bash
curl -s -X POST http://localhost:3000/api/publish/export-html \
  -H "Content-Type: application/json" \
  -d '{"draftId":"<issue_draft_id>"}'
```

Returns `ok`, `title`, and inline-styled `html`.

### Push To Beehiiv

Prerequisites:

- Beehiiv env vars configured
- Saved draft row with `content_json`

```bash
curl -s -X POST http://localhost:3000/api/publish/beehiiv \
  -H "Content-Type: application/json" \
  -d '{"draftId":"<issue_draft_id>"}'
```

Successful response includes `beehiiv.id`, `beehiiv.title`, `beehiiv.status`, and `beehiiv.web_url`.

### Troubleshooting

- `400 draftId required`: request body omitted `draftId` (or `id`).
- `404 Draft not found`: draft ID is incorrect or from a different workspace.
- `400 Draft has no structured content`: draft exists but `content_json` is null.
- `403 Beehiiv integration is not enabled`: Beehiiv env vars are missing or `BEEHIIV_ENABLED` is not `true`.
- `500 Beehiiv API error: ...`: Beehiiv rejected the request or returned an upstream error.

## License

Private — OnTheCorner Media.
