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
- A Supabase project with required tables (at minimum apply `lib/supabase/schema-issue_drafts.sql` and `lib/supabase/schema-content-outlines.sql`; see `lib/supabase/` for additional schemas)
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
BEEHIIV_ENABLED=false
BEEHIIV_API_KEY=your-beehiiv-api-key
BEEHIIV_PUBLICATION_ID=your-beehiiv-publication-id

# Optional — Issues → Phase 2 → Podcast script → Download MP3 (ElevenLabs)
ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_ID=
# ELEVENLABS_MODEL_ID=eleven_turbo_v2_5

# Optional — when set, Download MP3 also inserts podcast_episodes + uploads to this Storage bucket (private bucket recommended)
PODCAST_AUDIO_STORAGE_BUCKET=podcast-audio
```

Notes:

- Beehiiv variables are optional unless you plan to push drafts directly to Beehiiv.
- ElevenLabs variables are optional; without them, **Download MP3** on the Issues content-products panel returns a configuration error.
- **PODCAST_AUDIO_STORAGE_BUCKET:** create the bucket in Supabase Storage (same name as this value). With a **saved** issue draft, TTS download persists script + MP3 (`podcast_episodes` + `audio_storage_*`). In-memory-only drafts skip persistence (no `draftId`).
- `OPENAI_API_KEY` is required only when `LLM_PROVIDER=openai` or any `LLM_<ROLE>` uses `openai:<model>`.
- Per-role LLM variables are optional overrides; unset roles fall back to `LLM_PROVIDER` + `LLM_MODEL`.
- `ELEVENLABS_MODEL_ID` defaults to `eleven_turbo_v2_5` in `POST /api/content-products/podcast-tts` when omitted.

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
    ├── brand-profiles/      # List, create, seed, [id] get/patch
    ├── revenue/             # List, seed, recommend
    ├── workspace/settings/  # Default brand profile for this workspace
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

## Brand Profiles Runbook

`brand_profiles` defines voice/formatting constraints and optional ElevenLabs defaults used across Issues + content products.

### Endpoints

| Path | Method | Purpose |
|------|--------|---------|
| `/api/brand-profiles/list` | `GET` | List profile ids/names and current `defaultBrandProfileId` |
| `/api/brand-profiles/create` | `POST` | Create a profile from validated JSON fields |
| `/api/brand-profiles/[id]` | `GET` | Fetch one full profile |
| `/api/brand-profiles/[id]` | `PATCH` | Replace profile fields (same validation as create) |
| `/api/brand-profiles/seed` | `POST` | Seed Identity Jedi default only when workspace has zero profile rows |
| `/api/workspace/settings` | `GET` | Read workspace `defaultBrandProfileId` |
| `/api/workspace/settings` | `PATCH` | Set/clear workspace default profile |

### Create Profile Example

```bash
curl -s -X POST http://localhost:3000/api/brand-profiles/create \
  -H "Content-Type: application/json" \
  -d '{
    "name":"Identity Jedi",
    "voice_rules_json":{"tone":["direct","practical"]},
    "formatting_rules_json":{"paragraph_length":"3-4 sentences"},
    "forbidden_patterns_json":["In today'\''s digital world"],
    "cta_rules_json":{"default_cta":"Subscribe"},
    "emoji_policy_json":{"allowed":true,"allowed_emojis":["🏾"]},
    "narrative_preferences_json":{"core_thesis":["Identity is the control plane."]},
    "profile_version":"1.0",
    "elevenlabs_voice_id":"<optional_voice_id>",
    "elevenlabs_model_id":"<optional_model_id>"
  }'
```

Validation constraints (enforced by `lib/brand-profile/creatorBrandProfile.ts`):

- `name` required (non-empty string).
- `voice_rules_json`, `formatting_rules_json`, `cta_rules_json`, `emoji_policy_json`, `narrative_preferences_json` must be JSON objects.
- `forbidden_patterns_json` must be a JSON array.
- ElevenLabs fields are optional string-or-null.

### Workspace Default

Set default:

```bash
curl -s -X PATCH http://localhost:3000/api/workspace/settings \
  -H "Content-Type: application/json" \
  -d '{"defaultBrandProfileId":"<brand_profile_id>"}'
```

Clear default:

```bash
curl -s -X PATCH http://localhost:3000/api/workspace/settings \
  -H "Content-Type: application/json" \
  -d '{"defaultBrandProfileId":null}'
```

Operational notes:

- `defaultBrandProfileId` must point to a profile in the same workspace; cross-workspace ids return `404`.
- Issues page loads this default and preselects it when present.

## Content Products Runbook (Issues Phase 2)

Phase 2 endpoints transform a newsletter draft (`draftId`) or in-memory `content_json` into derivative assets.

### Endpoints

| Path | Method | Purpose |
|------|--------|---------|
| `/api/content-products/social-snippets` | `POST` | Returns `{ ok, snippets: { x_post, linkedin_teaser, threads } }` |
| `/api/content-products/podcast-script` | `POST` | Returns TTS-oriented script JSON + signal grounding counts |
| `/api/content-products/podcast-tts` | `POST` | Returns `audio/mpeg`; optional persistence to `podcast_episodes` + Storage |
| `/api/content-products/podcast-outline` | `POST` | Legacy beats outline endpoint (deprecated in headers) |
| `/api/content-products/sponsorship-alignment` | `POST` | Returns best-fit revenue item recommendation |

### Brand Resolution Rules

- `social-snippets`: prefers `issue_drafts.brand_profile_id` when `draftId` is provided; otherwise falls back to `brandProfileId` in request body (used by in-memory drafts).
- `podcast-tts`: voice/model resolution priority is `body.voiceId`/`body.modelId` → draft brand profile (`elevenlabs_voice_id`, `elevenlabs_model_id`) → env defaults.

### TTS Persistence Example

```bash
curl -s -X POST http://localhost:3000/api/content-products/podcast-tts \
  -H "Content-Type: application/json" \
  -d '{
    "draftId":"<issue_draft_id>",
    "persist":true,
    "script":{"working_title":"...","script_segments":[{"id":"intro","narrator_text":"..."}],"outro_cta":"..."}
  }' --output episode.mp3
```

Persistence constraints:

- Requires `WORKSPACE_ID`, `PODCAST_AUDIO_STORAGE_BUCKET`, `draftId`, and `script` when `persist=true`.
- On partial persistence failure, the route still returns MP3 and reports status via response headers (`X-Podcast-Persist-*`).

### Troubleshooting

- `400 draftId required`: no `draftId` and no `content_json` provided where required.
- `404 Draft not found or has no content_json`: draft id is invalid for this workspace or row has no structured draft payload.
- `400 No ElevenLabs voice...`: no request voice, no env voice, and no voice on the draft's brand profile row.
- `503 ELEVENLABS_API_KEY is not configured`: TTS env key missing.
- `404 No active revenue items to align`: sponsorship endpoint needs active rows in `revenue_items`.

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
