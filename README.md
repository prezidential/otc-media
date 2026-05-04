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
- **UI:** Tailwind CSS v4, Lucide React, Instrument Serif + Geist Mono Studio shell
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

# Optional — ACE scheduled/manual automation + Telegram approvals
ACE_ENABLED=false
CRON_SECRET=your-cron-secret
NOTIFICATION_PROVIDER=telegram
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
TELEGRAM_WEBHOOK_SECRET=
```

Notes:

- Beehiiv variables are optional unless you plan to push drafts directly to Beehiiv.
- ElevenLabs variables are optional; without them, **Download MP3** on the Issues content-products panel returns a configuration error.
- **PODCAST_AUDIO_STORAGE_BUCKET:** create the bucket in Supabase Storage (same name as this value). With a **saved** issue draft, TTS download persists script + MP3 (`podcast_episodes` + `audio_storage_*`). In-memory-only drafts skip persistence (no `draftId`).
- `OPENAI_API_KEY` is required only when `LLM_PROVIDER=openai` or any `LLM_<ROLE>` uses `openai:<model>`.
- Per-role LLM variables are optional overrides; unset roles fall back to `LLM_PROVIDER` + `LLM_MODEL`.
- ACE variables are optional unless you run `/ace`, `/api/ace/cron`, or notification approvals. See [`docs/Cornerstone-OS-ACE.md`](docs/Cornerstone-OS-ACE.md) for Telegram webhook setup and required ACE schemas.

### Install & Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000); `/` redirects to the Studio dashboard at `/dashboard`.

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
├── components/          # Studio shell, command palette, shared page pieces
├── page.tsx             # Redirects to /dashboard
├── dashboard/page.tsx   # Studio home: pipeline counts, nudge, quick actions
├── signals/page.tsx     # Captured signals and ingest entry points
├── research/page.tsx    # Research console
├── leads/page.tsx       # Editorial leads
├── issues/page.tsx      # Issue draft generation
├── outlines/page.tsx    # Content outlines CRUD UI
├── brand-profiles/      # Workspace brand voice profiles
├── brainstorm/page.tsx  # Conversational ideation over workspace signals
├── ace/page.tsx         # Autonomous Content Engine dashboard
└── api/
    ├── dashboard/stats/     # Studio counts, greeting, sidebar badges
    ├── search/              # Cmd/Ctrl+K command palette entity search
    ├── ace/                 # Dashboard, manual run, cron run
    ├── brainstorm/          # Sessions, messages, manual signal, promote
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
├── ace/                 # ACE orchestrator, lane balance, run helpers
├── brainstorm/          # Tool loop, system prompt, promote-to-issue mapping
├── dashboard/           # Studio stats and nudge helpers
├── draft/               # DraftObject type, renderer, lint, parser
├── content-outlines/    # Outline specs, validation, resolution, access checks
├── leads/               # Zod schema for lead validation
├── llm/                 # Provider abstraction + role-based model selection
├── research/            # RSS feed map (8 directives, 13+ sources)
├── studio/              # Studio nav and inner-page CSS class tokens
├── supabase/            # Server + browser clients
└── utils.ts             # cn() utility

__tests__/               # Vitest tests (unit + API route)
docs/                    # System specs, ACE spec, Studio design handoffs
```

## Architecture

See [`docs/cornerstone-system-spec-v2.md`](docs/cornerstone-system-spec-v2.md) for the current system specification including design principles, architecture details, guardrails, and roadmap. ACE implementation details live in [`docs/Cornerstone-OS-ACE.md`](docs/Cornerstone-OS-ACE.md); Studio visual references live in [`docs/design_handoff_cornerstone_dashboard/README.md`](docs/design_handoff_cornerstone_dashboard/README.md) and [`docs/design_handoff_inner_pages/README.md`](docs/design_handoff_inner_pages/README.md).

## Studio Shell Runbook

`app/layout.tsx` wraps the app in `StudioAppShell`, so all primary routes share the cream Studio chrome, sidebar navigation, mobile nav, sidebar badges, and command palette. The sidebar routes come from `STUDIO_NAV` in `lib/studio/nav.ts`.

### Dashboard And Search

| Path | Method | Purpose |
|------|--------|---------|
| `/dashboard` | UI | Studio home with pipeline counts, ingest shortcuts, nudge card, and promote-from-signal actions |
| `/api/dashboard/stats` | `GET` | Counts `signals`, pending `editorial_leads`, draft/reviewed `issue_drafts`, active `content_outlines`, last ingest freshness, and sidebar badge text |
| `/api/search?q=<term>` | `GET` | Command palette search across Studio pages, `signals`, `editorial_leads`, `issue_drafts`, and active `content_outlines` |

Press `Cmd+K` or `Ctrl+K` to open the command palette. Empty search shows navigation destinations; non-empty search adds workspace-scoped database results. Signal results with external URLs open in a new tab, while leads, drafts, and outlines route back to their Studio pages.

Operational constraints:

- `WORKSPACE_ID` must be configured for dashboard stats and search.
- Search escapes PostgREST wildcard characters and caps query fragments at 80 characters.
- Sidebar badge counts are best-effort; the shell ignores stats fetch failures so page content can still render.

## Brainstorming Hub Runbook

The Brainstorming Hub is the conversational ideation surface at `/brainstorm`. Sessions and messages persist in Supabase via `brainstorm_sessions` and `brainstorm_messages`; each turn reloads recent history, optional brand-profile rules, and tool results before calling the `brainstorm` LLM role.

### Setup

Apply `lib/supabase/schema-brainstorm.sql` and configure `LLM_BRAINSTORM` if the brainstorm role should use a different provider/model from the global default. The UI also reads brand profiles from `/api/brand-profiles/list`, so seed or create a brand profile before promoting brainstorm artifacts into issue drafts.

### API Paths

| Path | Method | Purpose |
|------|--------|---------|
| `/api/brainstorm/sessions` | `GET` | List the latest 80 sessions for `WORKSPACE_ID` |
| `/api/brainstorm/sessions` | `POST` | Create a session with optional `{ "title", "brandProfileId" }` |
| `/api/brainstorm/sessions/[id]` | `GET` | Fetch session metadata and `artifact_json` |
| `/api/brainstorm/sessions/[id]/messages` | `GET` | List messages for a session |
| `/api/brainstorm/sessions/[id]/messages` | `POST` | Add a user turn, run the Brainstormer tool loop, and persist the assistant turn |
| `/api/brainstorm/sessions/[id]/confirm-manual-signal` | `POST` | Insert the pending manual signal proposed by the agent |
| `/api/brainstorm/sessions/[id]/promote-draft` | `POST` | Convert `artifact_json.working_artifact` into an `issue_drafts` row |

### Tool Loop Capabilities

The Brainstormer can call these server-side tools from `lib/brainstorm/signal-tools.ts`:

- `query_signals`: searches workspace `signals` by title, optional directive, and recent-day window.
- `get_signal`: fetches one workspace-scoped signal with summary, raw text, scores, and tags.
- `list_recent_drafts`: returns recent `issue_drafts` titles from `content_json`.
- `trigger_signal_ingest`: runs bounded daily or weekly cadence ingest through `runCadenceIngest`.
- `propose_manual_signal`: stores a pending signal on the session for human confirmation.
- `save_artifact_draft`: stores a working outline, key claims, cited signal ids, and thesis in `artifact_json.working_artifact`.

### Usage Examples

Create a session:

```bash
curl -s -X POST http://localhost:3000/api/brainstorm/sessions \
  -H "Content-Type: application/json" \
  -d '{"title":"RSA angle exploration","brandProfileId":"<brand_profile_id>"}'
```

Send a non-streaming turn:

```bash
curl -s -X POST http://localhost:3000/api/brainstorm/sessions/<session_id>/messages \
  -H "Content-Type: application/json" \
  -d '{"content":"Find recent identity-security signals and shape a contrarian newsletter thesis."}'
```

Send a streaming turn by adding `"stream": true`; the response is newline-delimited JSON with `start`, `delta`, `error`, and `done` events. Add `"signalId": "<signal_id>"` to pin a user-selected signal into the prompt context.

Promote a saved artifact:

```bash
curl -s -X POST http://localhost:3000/api/brainstorm/sessions/<session_id>/promote-draft \
  -H "Content-Type: application/json" \
  -d '{"brandProfileId":"<brand_profile_id>"}'
```

Promotion requires a saved `working_artifact`; ask the agent to save the direction first if the endpoint returns `Nothing to promote`. The promote path uses the `drafting` LLM role to map the artifact into a validated `DraftObject`, renders Markdown, and inserts `issue_drafts`.

### Troubleshooting

- `500 WORKSPACE_ID not configured`: set `WORKSPACE_ID` in `.env.local`.
- `404 Session not found`: session id is missing or belongs to another workspace.
- `400 content is required`: message body has no non-empty `content`.
- `400 brandProfileId is required`: the session has no brand profile and promote was called without an override.
- `400 No pending manual signal on this session`: the agent has not proposed a manual signal for confirmation.

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

## ACE Runbook

ACE (Autonomous Content Engine) is the scheduled/manual automation loop exposed at `/ace`. The page reads `GET /api/ace/dashboard` for the latest run, pending notification approvals, recent run history, lane balance, and the `ACE_ENABLED` flag.

### API Paths

| Path | Method | Purpose |
|------|--------|---------|
| `/api/ace/dashboard` | `GET` | Returns ACE status, pending approvals, last 10 runs, and lane balance |
| `/api/ace/run` | `POST` | Manually runs ACE with optional `{ "forceRerun": true }` |
| `/api/ace/cron` | `POST` | Cron-safe ACE trigger guarded by `Authorization: Bearer $CRON_SECRET` |

### Manual Run

```bash
curl -s -X POST http://localhost:3000/api/ace/run \
  -H "Content-Type: application/json" \
  -d '{"forceRerun":false}'
```

Use `forceRerun: true` to bypass normal rerun checks from the UI's **Force** button.

### Cron Run

```bash
curl -s -X POST http://localhost:3000/api/ace/cron \
  -H "Authorization: Bearer $CRON_SECRET"
```

Operational constraints:

- `ACE_ENABLED=true` is required for cron runs to execute; otherwise `/api/ace/cron` returns a skipped result.
- `/api/ace/cron` requires `CRON_SECRET`; `/api/ace/run` is intended for trusted app contexts and directly calls `runAce`.
- ACE reads/writes `ace_runs`, `notification_approvals`, and lane-related tables. Apply the ACE schema bundle described in `docs/Cornerstone-OS-ACE.md` before enabling it.
- Telegram approvals require `NOTIFICATION_PROVIDER=telegram`, Telegram token/chat/webhook variables, and the webhook registration documented in `docs/Cornerstone-OS-ACE.md`.

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
