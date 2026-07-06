# Cornerstone OS

AI-powered newsroom engine by [OnTheCorner Media](https://github.com/prezidential/otc-media). Cornerstone automates the editorial pipeline for the **Identity Jedi Newsletter** — from research ingestion through draft generation — so the editor starts with a structured, voice-consistent draft instead of a blank page.

## What It Does

| Stage | Description |
|-------|-------------|
| **Research** | Ingests RSS feeds across 8 directives (Identity + AI, Agentic AI Security, CIEM, ITDR, etc.) covering 13+ cybersecurity sources |
| **Leads** | Generates editorial leads from signals via role-configured LLM calls, with citation enforcement and human approval workflow |
| **Newsroom Home** | Routes signed-in users to `/dashboard`, the status hub for the creator loop |
| **Brainstorm** | Grounds ideation in signals, health, and performance data before promoting drafts into Issues |
| **Drafting** | Produces saved newsletter issues (Title, Hook, Fresh Signals, Deep Dive, Dojo Checklist, Promo, Close) with thesis-driven editorial angles |
| **Revision** | Edits saved DraftObject sections inline, manages the "This Week" signal panel, and regenerates selected sections with lint guardrails |
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
# WORKSPACE_ID — REMOVED in Phase 2A M2. No longer required (or read) by any
# production route. User-facing routes resolve the active workspace via
# `requireWorkspace()` from `@/lib/auth/session`. The ACE cron entrypoint
# iterates `workspace_settings.ace_enabled = true` (see
# `lib/supabase/schema-workspace-settings.sql`); inbound webhooks encode the
# workspace id in the URL path
# (`/api/notifications/webhook/[provider]/[workspaceId]`).
LLM_PROVIDER=anthropic
LLM_MODEL=claude-sonnet-4-6
LLM_RESEARCH=anthropic:claude-sonnet-4-6
LLM_LEADS=anthropic:claude-sonnet-4-6
LLM_EDITOR=anthropic:claude-sonnet-4-6
LLM_DRAFTING=anthropic:claude-sonnet-4-6
LLM_REVISION=anthropic:claude-sonnet-4-6
LLM_LINT=anthropic:claude-sonnet-4-6
LLM_LINKEDIN=anthropic:claude-sonnet-4-6
LLM_BRAINSTORM=anthropic:claude-sonnet-4-6
BEEHIIV_ENABLED=false
BEEHIIV_API_KEY=your-beehiiv-api-key
BEEHIIV_PUBLICATION_ID=your-beehiiv-publication-id
# Optional — route Beehiiv analytics through its MCP server. The Beehiiv MCP
# server uses OAuth (not a static key): connect once via the "Connect Beehiiv"
# button (/api/integrations/beehiiv/oauth/start) which self-registers a client
# (DCR + PKCE) and stores per-workspace tokens. BEEHIIV_MCP_TOKEN/BEEHIIV_API_KEY
# remain a static-Bearer fallback for servers that accept it.
BEEHIIV_MCP_SERVER_URL=https://mcp.beehiiv.com/mcp

# Supergrow (LinkedIn analytics) — MCP-based. The MCP URL carries the api_key as a
# query param, so no Bearer header is needed. SUPERGROW_WORKSPACE_ID avoids an extra
# list_workspaces call (discover it via the Supergrow list_workspaces MCP tool).
SUPERGROW_API_KEY=your-supergrow-api-key
SUPERGROW_MCP_SERVER_URL=https://mcp.supergrow.ai/mcp?api_key=your-supergrow-api-key
SUPERGROW_WORKSPACE_ID=your-supergrow-workspace-uuid

# Optional — Issues → Phase 2 → Podcast script → Download MP3 (ElevenLabs)
ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_ID=
# ELEVENLABS_MODEL_ID=eleven_multilingual_v2

# Optional — when set, Download MP3 also inserts podcast_episodes + uploads to this Storage bucket (private bucket recommended)
PODCAST_AUDIO_STORAGE_BUCKET=podcast-audio

# Optional — workspace invite emails via Resend. When unset, POST /api/workspaces/[id]/members
# still creates the invite row and returns the join URL; owners share it manually.
RESEND_API_KEY=your-resend-api-key
EMAIL_FROM=cornerstone@onthecornermedia.com

# Optional — LinkedIn OAuth (Phase 2A M1). Without these, the /api/auth/linkedin
# endpoints return 503 and the integration is hidden in the UI.
LINKEDIN_CLIENT_ID=your-linkedin-client-id
LINKEDIN_CLIENT_SECRET=your-linkedin-client-secret
LINKEDIN_REDIRECT_URI=http://localhost:3000/api/auth/linkedin/callback
```

Notes:

- Beehiiv variables are optional unless you plan to push drafts directly to Beehiiv.
- ElevenLabs variables are optional; without them, **Download MP3** on the Issues content-products panel returns a configuration error.
- **PODCAST_AUDIO_STORAGE_BUCKET:** create the bucket in Supabase Storage (same name as this value). With a **saved** issue draft, TTS download persists script + MP3 (`podcast_episodes` + `audio_storage_*`). In-memory-only drafts skip persistence (no `draftId`).
- `OPENAI_API_KEY` is required only when `LLM_PROVIDER=openai` or any `LLM_<ROLE>` uses `openai:<model>`.
- Per-role LLM variables are optional overrides; unset roles fall back to `LLM_PROVIDER` + `LLM_MODEL`.
- **LinkedIn OAuth is optional in M1** — without `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, and `LINKEDIN_REDIRECT_URI`, the `/api/auth/linkedin/*` endpoints return 503. Apply `lib/supabase/schema-linkedin-crypto.sql` first (M2: bootstraps the pgsodium key + `linkedin_encrypt`/`linkedin_decrypt` helpers), then `lib/supabase/schema-linkedin.sql` (creates `linkedin_connections` + `linkedin_drafts`, the `linkedin_connections_decrypted` view, and the `upsert_linkedin_connection` RPC) in the Supabase SQL editor before connecting an account.
- **Beehiiv MCP OAuth** — the Beehiiv MCP server uses OAuth 2.1 (DCR + PKCE), so a static API key is rejected (401). Apply `lib/supabase/schema-beehiiv-crypto.sql` first (pgsodium key + `beehiiv_encrypt`/`beehiiv_decrypt`), then `lib/supabase/schema-beehiiv-oauth.sql` (creates `beehiiv_oauth_connections` + decrypted view + `upsert_beehiiv_connection` RPC + the `mcp_oauth_clients` DCR registry) in the Supabase SQL editor. Then set `BEEHIIV_MCP_SERVER_URL` + `BEEHIIV_PUBLICATION_ID` and click **Connect Beehiiv** on `/integrations/beehiiv` (or the Analytics dashboard) to authorize. Tokens are encrypted at rest and auto-refreshed.
- **LinkedIn tokens are encrypted at rest (M2).** `access_token` and `refresh_token` in `linkedin_connections` are pgsodium AEAD-DET ciphertext (`bytea`); the `pgsodium` extension must be enabled in the Supabase project. App code only ever sees plaintext (via the `linkedin_connections_decrypted` view and the `upsert_linkedin_connection` RPC, wrapped by `lib/linkedin/store.ts`). Pre-M2 deploys auto-migrate on re-running `schema-linkedin.sql` — see the file header for ordering.
- **OAuth sign-in providers (M2) are not configured in `.env.local`.** Google and LinkedIn-as-auth (`linkedin_oidc`) client IDs and secrets are stored in the Supabase dashboard under **Authentication → Providers**. See `docs/m2-oauth-runbook.md` for setup steps. These are separate from the M1 publishing-OAuth `LINKEDIN_*` env vars above.

### Install & Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Authenticated users land on
`/dashboard`; the primary studio loop is Dashboard → Brainstorm → Issues →
Analytics.

### First-Time Setup

1. **Seed brand profile:** `POST /api/brand-profiles/seed` (creates the Identity Jedi Newsletter profile)
2. **Seed directives:** `POST /api/research/seed-directives` (creates the 8 research directives)
3. **Seed revenue items:** `POST /api/revenue/seed` (creates default promo items)
4. **(Optional) Seed default outlines:** `POST /api/content-outlines/seed`, or on Issues use "Seed default outlines" when the workspace has no `content_outlines` rows yet
5. **Ingest signals:** Go to Research → click "Run All Directives"
6. **Generate leads:** Go to Leads → select brand profile → click "Generate Leads"
7. **Approve leads:** Review and approve leads on the Leads page
8. **Generate draft:** Go to Issues → configure steering, output mode, and outlines → click "Generate Issue Draft"
9. **Review/edit draft:** Use Issues → "Edit draft" to adjust saved DraftObject sections and the "This Week in Identity" signal list
10. **Publish (optional):** Use "Export HTML" or enable Beehiiv and use "Push to Beehiiv"

## Auth + Multi-Tenancy (Phase 2A — M0 → M2)

Cornerstone OS uses Supabase Auth + Postgres Row-Level Security for the
authorization boundary. See `docs/cornerstone-system-spec.md` §3.16 for the
full model.

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
4. Paste + run `lib/supabase/schema-workspace-settings.sql` — adds the
   `ace_enabled boolean` opt-in column the ACE cron entrypoint iterates over.
   To opt your existing legacy workspace into ACE in the same session, run
   `SET app.legacy_workspace_id = '<your-old-WORKSPACE_ID-uuid>';` first; the
   migration will flip its `ace_enabled` to true.

### Auth flow

- `/sign-in` and `/sign-up` use `supabaseBrowser` for email + password, plus
  **Continue with Google** and **Continue with LinkedIn** buttons that call
  `signInWithProvider` (`lib/auth/oauth.ts`) → `supabase.auth.signInWithOAuth()`.
  Providers must be enabled in the Supabase dashboard; see
  `docs/m2-oauth-runbook.md`. The redirect lands at `/api/auth/callback`, which
  exchanges the code for a session.
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

Email delivery for invites uses Resend when `RESEND_API_KEY` + `EMAIL_FROM` are
set; without them, owners still get the invite URL in the response and can
share it manually. The POST response includes
`email: { sent: boolean, error: string | null }` so the UI can show a banner
when delivery falls back. A one-click resend endpoint is available at
`POST /api/workspaces/[id]/members/[inviteId]/resend` (owner-only).

### Migration status (M2 — `WORKSPACE_ID` removed)

Every user-facing workspace-scoped route now uses `supabaseUser()` +
`requireWorkspace()`. The legacy `process.env.WORKSPACE_ID` env var is no
longer read by production code. RLS is the authorization boundary.

System-only call sites that have no user JWT use `supabaseAdmin()` and resolve
the workspace explicitly:

- **ACE cron** (`POST /api/ace/cron`) — iterates rows in `workspace_settings`
  where `ace_enabled = true` and runs `runAce()` once per workspace. The
  per-workspace opt-in column is added by
  `lib/supabase/schema-workspace-settings.sql`.
- **ACE run** (`POST /api/ace/run`) — dual-mode. User-initiated calls (the
  `/ace` page button) resolve the workspace from the session. Internal callers
  (the cron entrypoint) pass `Authorization: Bearer ${CRON_SECRET}` and
  `{ workspaceId }` in the body.
- **Inbound notification webhooks** — moved from
  `POST /api/notifications/webhook/[provider]` to
  `POST /api/notifications/webhook/[provider]/[workspaceId]`. Each workspace
  registers its own URL with the upstream provider (e.g. Telegram
  `setWebhook`). The legacy URL returns **HTTP 410 Gone** so misconfigured
  webhooks fail loudly. Webhook authenticity is still proven by the
  provider-level signature (e.g. Telegram's secret-token header); the path
  parameter is a routing hint and is cross-checked against the resolved
  approval row.
- **Health probe** (`GET /api/health`) — no longer checks `WORKSPACE_ID`. It
  reports Supabase reachability via a trivial `select` against `workspaces`.

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
├── page.tsx             # Redirects / to /dashboard
├── dashboard/page.tsx   # Newsroom home
├── brainstorm/page.tsx  # Brainstorming hub
├── research/page.tsx    # Research console
├── leads/page.tsx       # Editorial leads
├── issues/page.tsx      # Issue generation, editing, publishing, content products
├── outlines/page.tsx    # Content outlines CRUD UI
├── integrations/        # Beehiiv/Supergrow connections + analytics
└── api/
    ├── ingest/rss/          # Single RSS feed ingest
    ├── dashboard/stats/     # Newsroom home summary
    ├── brainstorm/          # Sessions, messages, draft promotion
    ├── research/            # Directives, run-directives, run-all
    ├── leads/               # Generate, list, approve
    ├── issues/              # Generate, list/latest, get/patch, regenerate-section
    ├── content-outlines/    # List/create/seed; [id] get/patch/delete (soft-disable)
    ├── brand-profiles/      # List, seed
    ├── revenue/             # List, seed, recommend
    ├── publish/             # Status, HTML export, Beehiiv draft push
    ├── integrations/        # Plugin status/action/query + analytics
    ├── signals/list/        # List captured signals
    ├── pipeline/run/        # Autonomous Researcher → Writer → Editor run
    └── runs/list/           # List ingest/generation runs

lib/
├── draft/               # DraftObject type, renderer, lint, parser
├── brainstorm/          # Brainstorm tools, prompts, promotion handoffs
├── dashboard/           # Newsroom summary helpers
├── integrations/        # Beehiiv/Supergrow plugin and MCP clients
├── content-outlines/    # Outline specs, validation, resolution, access checks
├── leads/               # Zod schema for lead validation
├── llm/                 # Provider abstraction + role-based model selection
├── research/            # RSS feed map (8 directives, 13+ sources)
├── supabase/            # Server + browser clients
└── utils.ts             # cn() utility

__tests__/               # Vitest tests (unit + API route)
docs/                    # Canonical system spec, runbooks, execution notes
```

## Architecture

See [`docs/cornerstone-system-spec.md`](docs/cornerstone-system-spec.md) for the current system specification including design principles, architecture details, guardrails, and roadmap.

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

## Issues Draft Editing Runbook

The Issues page is the human gate for saved `issue_drafts`. It loads draft
history, lets an editor deep-link to a specific draft, and saves hand edits
without adding schema columns.

### Codepaths

| Path | Method | Purpose |
|------|--------|---------|
| `/api/issues/list?limit=10` | `GET` | Recent saved drafts for the History panel |
| `/api/issues/[id]` | `GET` | Load one workspace-scoped draft; used by `/issues?draft=<id>` handoffs |
| `/api/issues/[id]` | `PATCH` | Save inline editor changes to `content_json` and re-render markdown `content` |
| `/api/signals/list?limit=25` | `GET` | Candidate source for "Pull current candidates" in the This Week panel |

### Editable fields

`PATCH /api/issues/[id]` accepts either a top-level patch or
`{ "content_json": { ... } }`. Only these DraftObject fields are editable:

- strings: `title`, `fresh_signals`, `deep_dive`, `last_word`, `promo_slot`, `close`
- string arrays: `hook_paragraphs`, `sources`

Unknown keys are ignored. Array fields keep string items only. The route merges
the sanitized patch onto the existing `content_json`, normalizes it through
`createDraftContent()`, writes both `content_json` and rendered markdown
`content`, and returns `{ ok, id, draft, content_json }`.

Example from an authenticated session or API client carrying the app session
cookies:

```bash
curl -s -X PATCH http://localhost:3000/api/issues/<draft_id> \
  -H "Content-Type: application/json" \
  -d '{
    "content_json": {
      "title": "Agents Need Guardrails",
      "hook_paragraphs": ["Identity teams are inheriting agent sprawl faster than policy can follow."],
      "fresh_signals": "**Fresh Signals**\n\nTwo agent identity stories shaped the week.\n\n**NIST drafts agent IAM guidance**\n\nWorth tracking for control owners.\n\nSources:\n- https://example.com/nist-agent-iam",
      "sources": ["https://example.com/nist-agent-iam"]
    }
  }'
```

### This Week panel

`fresh_signals` remains a single markdown string in `DraftContentJson`; the UI
uses `lib/draft/freshSignals.ts` to parse it into `{ synopsis, items[] }` and
serialize it back deterministically. The editor preserves the synopsis ("Part A")
while adding, editing, removing, or reordering cited signal items ("Part B").
"Pull current candidates" reads the same in-app signal feed as dashboard signal
widgets and filters out URLs already present in the current This Week list.

### Troubleshooting

- `401 Not authenticated`: the request is missing a Supabase session.
- `400 No editable fields provided in patch.`: the body omitted all whitelisted fields or used wrong types.
- `404 Draft not found.`: the draft id does not exist in the active workspace.
- Edits save but publish/export looks stale: check that the client used `PATCH /api/issues/[id]`; direct DB edits to `content_json` do not automatically re-render `content`.

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

- The request must come from an authenticated session with an active workspace;
  `requireWorkspace()` supplies the workspace id.
- `writer` and `editor` require an existing brand profile in `brand_profiles`
  for the active workspace.

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
