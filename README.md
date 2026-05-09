# Cornerstone OS

AI-powered newsroom engine by [OnTheCorner Media](https://github.com/prezidential/otc-media). Cornerstone automates the editorial pipeline for the **Identity Jedi Newsletter** — from research ingestion through draft generation — so the editor starts with a structured, voice-consistent draft instead of a blank page.

## What It Does

| Stage | Description |
|-------|-------------|
| **Research** | Ingests RSS feeds across 8 directives (Identity + AI, Agentic AI Security, CIEM, ITDR, etc.) covering 13+ cybersecurity sources |
| **Brainstorming** | Runs conversational ideation against workspace signals, manual signal proposals, saved artifacts, and Issues promotion |
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
6. **Ideate from signals (optional):** Go to Brainstorming, start a session, and promote a saved artifact to Issues
7. **Generate leads:** Go to Leads → select brand profile → click "Generate Leads"
8. **Approve leads:** Review and approve leads on the Leads page
9. **Generate draft:** Go to Issues → configure steering, output mode, and outlines → click "Generate Issue Draft"
10. **Publish (optional):** Use "Export HTML" or enable Beehiiv and use "Push to Beehiiv"

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
├── components/          # Studio shell, command palette, page header, shared UI
├── dashboard/page.tsx   # Studio dashboard
├── signals/page.tsx     # Signal review and Brainstorm deep links
├── research/page.tsx    # Research console
├── brainstorm/page.tsx  # Conversational ideation hub
├── leads/page.tsx       # Editorial leads
├── issues/page.tsx      # Issue draft generation + content products
├── outlines/page.tsx    # Content outlines CRUD UI
├── ace/page.tsx         # Autonomous Content Engine dashboard
└── api/
    ├── ingest/rss/          # Single RSS feed ingest
    ├── research/            # Directives, run-directives, run-all
    ├── brainstorm/          # Sessions, messages, manual signal confirm, draft promotion
    ├── leads/               # Generate, list, approve
    ├── issues/              # Generate, latest, regenerate-section
    ├── content-outlines/    # List/create/seed; [id] get/patch/delete (soft-disable)
    ├── brand-profiles/      # List/create/update/seed
    ├── revenue/             # List, seed, recommend
    ├── publish/             # Status, HTML export, Beehiiv draft push
    ├── signals/             # List and fetch captured signals
    ├── ace/                 # ACE manual run, cron, dashboard data
    ├── pipeline/run/        # Autonomous Researcher → Writer → Editor run
    └── runs/list/           # List ingest/generation runs

lib/
├── ace/                 # ACE orchestration and lane-balance helpers
├── brainstorm/          # Tool loop, signal tools, response parsing, promotion mapper
├── draft/               # DraftObject type, renderer, lint, parser
├── content-outlines/    # Outline specs, validation, resolution, access checks
├── leads/               # Zod schema for lead validation
├── llm/                 # Provider abstraction + role-based model selection
├── research/            # RSS feed map (8 directives, 13+ sources)
├── supabase/            # Server + browser clients
└── utils.ts             # cn() utility

__tests__/               # Vitest tests (unit + API route)
docs/                    # System specifications and design handoffs
```

## Architecture

See [`docs/cornerstone-system-spec-v2.md`](docs/cornerstone-system-spec-v2.md) for the current system specification including design principles, architecture details, guardrails, and roadmap.

## Brainstorming Hub Runbook

The Brainstorming Hub (`/brainstorm`) is a conversational workspace for turning existing research signals and creator direction into a saved artifact that can be promoted into the Issues workflow.

### Setup

Apply the Brainstorming schema before using the page:

```bash
# Run this SQL in Supabase
lib/supabase/schema-brainstorm.sql
```

Required runtime configuration:

- `WORKSPACE_ID` scopes every session, message, signal lookup, and promotion.
- `LLM_BRAINSTORM` is optional; when unset, the role falls back to `LLM_PROVIDER` + `LLM_MODEL`.
- `LLM_DRAFTING` is used when promoting a saved artifact into a validated `DraftObject`.

### User Flow

1. Open `/brainstorm`; the page loads recent sessions or creates a default "Brainstorm" session.
2. Optionally choose a brand profile before clicking **New**. The selected profile is attached to that new session and added to the Brainstormer system prompt.
3. Ask for angles, comparisons, or draft directions. From `/signals`, use the **Brainstorm** link to open the Hub with a pinned `signalId`.
4. The agent may use tools to query signals, fetch a signal, list recent drafts, trigger cadence ingest, propose a manual signal, or save a working artifact.
5. Review any pending manual signal in the Session hub and click **Insert signal** to create it in `signals`.
6. After the agent saves a working artifact, choose a brand profile if needed and click **Promote to Issues**. Promotion maps the artifact into `issue_drafts.content_json` and renders `issue_drafts.content`.

### API Surface

| Path | Method | Purpose |
|------|--------|---------|
| `/api/brainstorm/sessions` | `GET` | List up to 80 recent sessions for the workspace |
| `/api/brainstorm/sessions` | `POST` | Create a session; accepts `title` and optional `brandProfileId` |
| `/api/brainstorm/sessions/[id]` | `GET` | Fetch session detail, including `artifact_json` |
| `/api/brainstorm/sessions/[id]/messages` | `GET` | List up to 200 messages for the session |
| `/api/brainstorm/sessions/[id]/messages` | `POST` | Insert a user message, run a Brainstormer turn, and persist the assistant reply |
| `/api/brainstorm/sessions/[id]/confirm-manual-signal` | `POST` | Insert the pending manual signal from `artifact_json.pending_manual_signal` |
| `/api/brainstorm/sessions/[id]/promote-draft` | `POST` | Convert `artifact_json.working_artifact` into an Issues draft |

`POST /messages` accepts:

- `content` (required): user prompt text.
- `signalId` (optional): adds a pinned signal block to the prompt after verifying the signal belongs to the workspace.
- `stream` (optional boolean): returns newline-delimited JSON events (`start`, `delta`, `error`, `done`) with `Content-Type: application/x-ndjson`.

### Agent Tools

| Tool | Behavior | Constraints |
|------|----------|-------------|
| `query_signals` | Searches recent `signals` by title, directive, and age | Workspace-scoped; max `limit` 50 |
| `get_signal` | Returns one signal with summary/raw text/trust metadata | Workspace-scoped by id |
| `list_recent_drafts` | Lists recent issue draft ids and titles | Workspace-scoped; max `limit` 25 |
| `trigger_signal_ingest` | Runs daily or weekly cadence ingest | Uses `runCadenceIngest`; `limit_per_feed` is clamped from 5 to 30 |
| `propose_manual_signal` | Stores a pending manual signal on the session | Requires a session; human must click **Insert signal** before DB insert |
| `save_artifact_draft` | Stores `working_artifact` on the session | Required before promotion to Issues |

### Promotion Contract

Promotion is intentionally explicit. `POST /promote-draft` requires either the session's `brand_profile_id` or a request-body `brandProfileId`. It reads `artifact_json.working_artifact`, enriches cited signals from `signals`, asks the drafting LLM to produce JSON, validates it with `validateDraftObject`, renders markdown with `renderDraftMarkdown`, then inserts `issue_drafts`.

### Troubleshooting

- `500 WORKSPACE_ID not configured`: set `WORKSPACE_ID` in `.env.local`.
- `404 Session not found`: the session id is invalid or belongs to another workspace.
- `404 Brand profile not found`: the provided `brandProfileId` is not in this workspace.
- `400 content is required`: `POST /messages` received an empty prompt.
- `400 No pending manual signal on this session`: the agent has not called `propose_manual_signal`, or the signal was already inserted.
- `400 brandProfileId is required...`: the session has no brand profile and promotion did not pass one.
- `500 Nothing to promote...`: ask the agent to save an artifact first, or use the Hub hint to call `save_artifact_draft`.
- Missing `artifact_json` / column errors: re-run `lib/supabase/schema-brainstorm.sql`; it includes an idempotent `ALTER TABLE` for existing `brainstorm_sessions`.

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
