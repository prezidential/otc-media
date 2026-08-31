# Cornerstone OS — Agent Execution Plan v1

**Owner:** OnTheCorner Media  
**Audience:** Claude Code agents executing autonomous build phases  
**System spec:** `docs/cornerstone-system-spec.md`  
**Status:** Active  
**Last updated:** 2026-06-04  

---

## How to Use This Document

Each phase is a standalone, agent-executable unit of work. An agent assigned to a phase should:

1. Read this section **in full** before writing any code
2. Read the referenced spec sections (`§3.x`) in `docs/cornerstone-system-spec.md`
3. Run the listed pre-flight commands to understand current state
4. Implement in the exact file order listed (dependencies matter)
5. Run the verification commands before declaring done

**Branch convention:** Each phase gets its own feature branch from current main.  
**Commit convention:** One commit per logical unit; push to the phase branch; do not open a PR unless explicitly instructed.  
**No silently passing tests for wrong reasons.** If a test passes but the behavior it guards is not implemented, that is a bug — fix the test or the implementation.

---

## Status Inventory

| Component | Status | Phase |
|-----------|--------|-------|
| Research Engine + Intent + Sources | ✅ Implemented | — |
| Leads pipeline | ✅ Implemented | — |
| Draft generation + quality (last_word) | ✅ Implemented (PR #99 pending merge) | — |
| Brainstorming Hub (MVP + M1) | ✅ Implemented | — |
| ACE (cron, Telegram, lanes, approvals) | ✅ Implemented | — |
| Auth, RLS wave-1 + wave-2, tenancy | ✅ Implemented | — |
| Content products (social, podcast, TTS, sponsorship) | ✅ Implemented | — |
| Integrations framework (Beehiiv + Supergrow) | ✅ Implemented | — |
| Dashboard / Studio shell | ✅ Implemented | — |
| **Subscriber Health Pipeline** | 🔲 Not started | **Phase 1** |
| **Source Discovery (Phase 2D-P2)** | 🔲 Not started | **Phase 2** |
| **Signal Scoring (Phase 2D-P3)** | 🔲 Not started | **Phase 3** |
| **Content Products Polish** | 🔲 Not started | **Phase 4** |
| **LinkedIn Draft Engine** | 🔲 Not started | **Phase 5** |
| **Blog/Longform Output** | 🔲 Not started | **Phase 6** |
| Billing | ⏸ Deferred | TBD |

---

## Phase Dependencies

```
Phase 1 (Health Pipeline) ——— independent, can run in parallel with any phase
Phase 2 (Source Discovery) ——— depends on Phase 2D-P1 being shipped (✅ already is)
Phase 3 (Signal Scoring) ——— depends on Phase 2 shipping (adds relevance_score column)
Phase 4 (Content Products) ——— independent of Phase 2-3
Phase 5 (LinkedIn) ——— independent; can run in parallel with Phase 2-4
Phase 6 (Blog) ——— depends on Brainstorm Hub M1 being merged (✅ already is)
```

---

## Phase 1 — Subscriber Health Pipeline

**Spec section:** §3.17 (to be added to system spec)  
**Priority:** High — immediate operational need  
**Complexity:** Medium  
**Branch:** `claude/subscriber-health-pipeline`  

### Objective

A standalone script (`pipelines/subscriber-health.ts`) that runs via Railway cron every Monday at 8 AM Eastern. It pulls 7-day subscriber stats from Beehiiv, evaluates them against configurable KPI targets, and sends a structured Telegram message with ✅/🟡/🔴 status per metric.

This pipeline is **not part of the Next.js app** — it is a standalone Node script invoked by `node pipelines/subscriber-health.js` (after ts compilation or via `tsx`). It shares env vars with the app (`BEEHIIV_API_KEY`, `BEEHIIV_PUBLICATION_ID`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`) but has no import dependencies on Next.js or app routes.

### Pre-flight

```bash
# Confirm env vars are set
echo $BEEHIIV_API_KEY
echo $BEEHIIV_PUBLICATION_ID
echo $TELEGRAM_BOT_TOKEN
echo $TELEGRAM_CHAT_ID

# Check existing directory structure
ls pipelines/ 2>/dev/null || echo "create pipelines/"
ls config/ 2>/dev/null || echo "create config/"
ls data/ 2>/dev/null || echo "create data/"
```

### Environment Variables

No new env vars are needed — all are already defined:

| Variable | Purpose |
|----------|---------|
| `BEEHIIV_API_KEY` | Beehiiv REST API auth |
| `BEEHIIV_PUBLICATION_ID` | Publication ID (e.g. `pub_c4b35bf5-24ed-4ccb-b4c2-8ae43a44818a`) |
| `TELEGRAM_BOT_TOKEN` | Bot token from @BotFather |
| `TELEGRAM_CHAT_ID` | Chat ID to send report to |

Add to Railway environment (not new — already present for ACE).

### New Files to Create

#### 1. `config/subscriber-kpis.json`

KPI targets and warn thresholds. All values are **numbers** (raw counts or percentages as plain numbers, e.g. `70` for 70%).

```json
{
  "weeklyNewSubs": { "target": 10, "warn": 5 },
  "linkedInSourcedPercent": { "target": 70, "warn": 40 },
  "boostSourcedPercent": { "target": 0, "warn": 5 },
  "monthlyChurnRate": { "target": 3, "warn": 6 },
  "openRate": { "target": 65, "warn": 60 },
  "clickRate": { "target": 2, "warn": 1 },
  "paidSubscribers": { "target": 25, "warn": 13 }
}
```

#### 2. `data/kpi-history.json`

Persistent state for consecutive-week failure tracking. Initialize with an empty object; the script creates/updates it at runtime.

```json
{}
```

This file should be added to `.gitignore` since it's runtime state, not source. But commit the empty initial version so the `data/` directory exists.

#### 3. `pipelines/subscriber-health.ts`

Standalone TypeScript script. Entry point: `main()` called at the bottom with `main().catch(console.error)`.

**Structure:**

```typescript
// pipelines/subscriber-health.ts
//
// Weekly subscriber health report.
// Usage: npx tsx pipelines/subscriber-health.ts
// Or after build: node pipelines/subscriber-health.js

import * as fs from "fs";
import * as path from "path";
```

**Beehiiv API calls (in order):**

```
Base URL: https://api.beehiiv.com/v2
Auth header: Authorization: Bearer ${BEEHIIV_API_KEY}

1. GET /publications/${BEEHIIV_PUBLICATION_ID}/stats
   → overall subscriber counts, paid subscribers

2. GET /publications/${BEEHIIV_PUBLICATION_ID}/posts?status=confirmed&limit=3&order_by=publish_date&direction=desc
   → last 3 published posts (for open rate + click rate averages)

3. GET /publications/${BEEHIIV_PUBLICATION_ID}/posts/{postId}/stats   (for each of the 3 posts)
   → open_rate, click_rate per post

4. GET /publications/${BEEHIIV_PUBLICATION_ID}/subscriptions?status=active&order_by=created&direction=desc&limit=500
   → subscriptions created in last 7 days (filter client-side by created_at >= 7 days ago)
```

**Data extraction:**

From `/stats`:
- `data.total_active_subscriptions` → total active subs
- `data.paid_subscriptions` (if available) → paidSubscribers
- Monthly churn: derive from `data.total_active_subscriptions` and `data.churn_rate` if available, or use `data.net_new_subscribers_30d` and `data.total_active_subscriptions` to approximate

From post stats:
- Average `open_rate` across last 3 posts → openRate (as %)
- Average `click_rate` across last 3 posts → clickRate (as %)

From subscriptions (last 7 days):
- Count where `created_at >= Date.now() - 7*24*60*60*1000` → weeklyNewSubs
- Count where `referral_code` starts with `"LI_"` → linkedInSourced
- Count where `utm_source` or `referral_code` includes `"boost"` (case-insensitive) → boostSourced
- `linkedInSourcedPercent = (linkedInSourced / weeklyNewSubs) * 100`
- `boostSourcedPercent = (boostSourced / weeklyNewSubs) * 100`
- If weeklyNewSubs is 0, both percents are 0

**KPI evaluation logic:**

```typescript
type KpiStatus = "green" | "yellow" | "red";
type KpiConfig = { target: number; warn: number };

// Standard (higher is better):
function evalStandard(value: number, cfg: KpiConfig): KpiStatus {
  if (value >= cfg.target) return "green";
  if (value >= cfg.warn) return "yellow";
  return "red";
}

// Inverted (lower is better — used for boostSourcedPercent and monthlyChurnRate):
function evalInverted(value: number, cfg: KpiConfig): KpiStatus {
  if (value <= cfg.target) return "green";
  if (value <= cfg.warn) return "yellow";
  return "red";
}
```

Metrics using inverted logic: `boostSourcedPercent`, `monthlyChurnRate`.

Status emoji map:
- `"green"` → `"✅"`
- `"yellow"` → `"🟡"`
- `"red"` → `"🔴"`

**KPI history management:**

History file path: `data/kpi-history.json`

Shape:
```typescript
type KpiHistory = {
  [metric: string]: {
    consecutiveWeeksBelow: number;
    lastStatus: "green" | "yellow" | "red";
  };
};
```

Logic:
- Load history file (if missing, start with `{}`)
- After evaluating each metric:
  - If `status === "red"`: increment `consecutiveWeeksBelow` (or initialize to 1)
  - If `status !== "red"`: reset `consecutiveWeeksBelow` to 0
  - Update `lastStatus`
- Save updated history back to file
- For any metric where `consecutiveWeeksBelow >= 3`, append a warning line below that metric in the Telegram message

**Telegram message format:**

```
📊 Subscriber Health Report
{YYYY-MM-DD} (Week {weekNumber})

📈 Growth
New subs (7d): {weeklyNewSubs} {emoji} (target: {target})
LinkedIn sourced: {linkedInSourcedPercent}% {emoji} (target: {target}%)
Boost sourced: {boostSourcedPercent}% {emoji} (warn: {warn}%)

💔 Retention
Monthly churn: {monthlyChurnRate}% {emoji} (target: <{target}%)
Open rate (last 3): {openRate}% {emoji} (target: {target}%)
Click rate (last 3): {clickRate}% {emoji} (target: {target}%)

💰 Monetization
Paid subscribers: {paidSubscribers} {emoji} (target: {target})
```

If `consecutiveWeeksBelow >= 3` for a metric, add immediately below that metric's line:
```
(⚠️ {MetricLabel} below warn threshold for {N} consecutive weeks)
```

If any metric is 🔴 (red), append a footer line:
```
📌 Dashboard: {CORNERSTONE_URL}/integrations/analytics
```
(Only if `CORNERSTONE_URL` env var is set; skip otherwise)

**Week number:** Use ISO week number (standard — week 1 contains the first Thursday of the year).

**Error handling:** If any Beehiiv API call fails with a non-200 status, throw with the endpoint and status code. If any required env var is missing (`BEEHIIV_API_KEY`, `BEEHIIV_PUBLICATION_ID`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`), throw a descriptive error before making any API calls.

**Telegram send:**

```typescript
// POST https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage
// Body: { chat_id: TELEGRAM_CHAT_ID, text: message, parse_mode: "HTML" }
// Note: the message text is plain text (no HTML tags), so parse_mode is optional
```

#### 4. `__tests__/pipelines/subscriber-health.test.ts`

Unit tests — mock fetch, do not call real APIs.

**Test structure:**

```typescript
// Mock modules
vi.mock("node:fs"); // mock fs.readFileSync and fs.writeFileSync

// Test groups:
describe("KPI evaluation", () => {
  it("evalStandard: green when value >= target")
  it("evalStandard: yellow when warn <= value < target")
  it("evalStandard: red when value < warn")
  it("evalInverted: green when value <= target")
  it("evalInverted: yellow when target < value <= warn")
  it("evalInverted: red when value > warn")
})

describe("Subscription filtering", () => {
  it("counts only subscriptions within last 7 days")
  it("counts LinkedIn-sourced by LI_ prefix on referral_code")
  it("counts boost-sourced by 'boost' in utm_source or referral_code")
  it("handles empty subscription list gracefully (no division by zero)")
})

describe("KPI history", () => {
  it("initializes empty history when file not found")
  it("increments consecutiveWeeksBelow when metric is red")
  it("resets consecutiveWeeksBelow to 0 when metric recovers")
  it("preserves other metric history when one metric changes")
})

describe("Telegram message formatting", () => {
  it("includes all 3 sections: Growth, Retention, Monetization")
  it("shows correct status emoji per metric status")
  it("appends consecutive-week warning when consecutiveWeeksBelow >= 3")
  it("does not append warning when consecutiveWeeksBelow < 3")
  it("omits dashboard footer when CORNERSTONE_URL is not set")
})

describe("Error handling", () => {
  it("throws descriptive error when BEEHIIV_API_KEY is missing")
  it("throws with endpoint + status when API returns non-200")
})
```

### Files to Modify

#### `.gitignore`

Add `data/kpi-history.json` to prevent committing runtime state:

```
# Runtime pipeline state
data/kpi-history.json
```

But keep `data/` itself tracked (for the initial empty file).

#### `package.json` — add pipeline run script

Add to the `scripts` section:
```json
"health-report": "npx tsx pipelines/subscriber-health.ts"
```

### Railway Cron Configuration

In Railway dashboard → Service → Settings → Cron Jobs, add:

| Field | Value |
|-------|-------|
| Schedule | `0 13 * * 1` |
| Command | `npx tsx pipelines/subscriber-health.ts` |
| Note | 13:00 UTC = 8 AM ET (EST). During EDT (UTC-4), use `0 12 * * 1`. Adjust seasonally or use a fixed UTC time. |

**Alternative:** Since the app is a Next.js server, the cron can also call a lightweight internal API route:

`POST /api/pipelines/health-report` — protected by `CRON_SECRET`, calls the same logic as the script. This is cleaner for Railway cron (no tsx dependency) but adds an API route. Implement the script first; the API route is optional polish.

### Acceptance Criteria (DoD)

- [ ] `npx tsx pipelines/subscriber-health.ts` runs to completion locally
- [ ] Telegram message arrives at configured chat ID with correct format
- [ ] All 3 Beehiiv API calls are made (verify via network logs or mock in test)
- [ ] `data/kpi-history.json` is created/updated after each run
- [ ] Consecutive-week warning appears after 3 red weeks (simulate by seeding history file)
- [ ] All unit tests pass (`npm test -- subscriber-health`)
- [ ] TypeScript compiles clean (`npx tsc --noEmit`)
- [ ] Missing env var produces a clear error message, not a cryptic fetch failure

---

## Phase 2 — Source Discovery (Researcher Agent, Phase 2D-P2)

**Spec section:** §3.3 Phase 2  
**Priority:** Medium — improves research pipeline quality over time  
**Complexity:** Medium  
**Branch:** `claude/source-discovery`  
**Prerequisite:** Phase 2D-P1 shipped (✅ already done — `research_sources` table exists)  

**Shipped vs remaining (as of 2026-08):** The Research Setup **Proposed Sources** queue (Approve / Reject via existing `/api/research-sources/[id]/approve|reject` routes) is already in `app/signals/ResearchSetupTab.tsx`. It only renders when `status=proposed` rows exist. Remaining work is the agent that **creates** those rows, plus the Discover Sources button / `POST /api/pipeline/discover-sources` rate-limited endpoint. Do not rebuild the queue UI.

### Objective

Add `discover_sources()` tool to the Researcher Agent. When called, the agent uses web search to find RSS feeds relevant to the workspace Research Intent profile (`topic_focus`, `watch_entities`, `keywords`) and inserts results as `research_sources` rows with `status=proposed`, `proposed_by=agent`, `trust_score=0.7`. Runs on a weekly schedule independent of the daily ingest cycle. Proposed sources appear in the Research Setup UI for the user to Approve or Reject.

### Pre-flight

```bash
# Confirm research_sources table has status='proposed' rows working (or is empty)
# Read lib/agents/researcher.ts to understand current tool set
# Read app/signals/page.tsx to understand the Research Setup tab
# Read app/api/research-sources/list/route.ts
```

### New Files

#### `lib/agents/tools/discover-sources.ts`

Tool implementation: given a `workspaceId`, fetches the workspace Research Intent profile, then uses web search (via `callLLM` with a research role or a direct search provider) to find RSS/Atom feeds for discovered publications. Validates feed URLs (HEAD request or basic format check) before inserting.

```typescript
export async function discoverSourcesForWorkspace(
  workspaceId: string,
  supabase: SupabaseClient
): Promise<{ proposed: number; skipped: number; sources: ProposedSource[] }>
```

**Logic:**
1. Load `research_intent` row for `workspaceId`
2. Build search query from `topic_focus + watch_entities + keywords`
3. Use `callLLM("research", [...])` with a prompt that asks the model to return a JSON array of `{ name, feedUrl, siteUrl, rationale }` objects for relevant publications
4. For each returned feed:
   - Check it doesn't already exist in `research_sources` for this workspace (by `feed_url`)
   - Insert as `{ workspace_id, name, feed_url, site_url, status: "proposed", proposed_by: "agent", trust_score: 0.7 }`
5. Return counts

#### `app/api/pipeline/discover-sources/route.ts`

```
POST /api/pipeline/discover-sources
Auth: requireWorkspace()
Body: {} (workspace resolved from cookie)
Response: { ok: true, proposed: N, skipped: N }
```

Calls `discoverSourcesForWorkspace`. Rate-limit to one call per workspace per 24 hours (check `research_sources` for rows with `proposed_by=agent` and `created_at > NOW() - INTERVAL '24 hours'`; return `{ ok: true, skipped: true, reason: "ran recently" }` if found).

### Files to Modify

#### `lib/agents/researcher.ts`

Add `discover_sources` tool definition alongside existing tools:

```typescript
{
  name: "discover_sources",
  description: "Use web search to find RSS feeds relevant to the workspace Research Intent profile. Inserts results as proposed sources for human review.",
  execute: async ({ workspaceId }) => {
    return await discoverSourcesForWorkspace(workspaceId, supabase);
  }
}
```

#### `app/signals/ResearchSetupTab.tsx` — Proposed Sources queue

**Shipped.** `SourcesList` already:
- Fetches `GET /api/research-sources/list` on mount (client-filters `proposed` vs `approved`)
- Renders one card per proposed source: name, feed URL, “Proposed by agent” tag
- Approve → `POST /api/research-sources/{id}/approve`
- Reject → `POST /api/research-sources/{id}/reject`
- Section is hidden when `proposed.length === 0`

**Still to add in this file:** empty-state copy (“Run source discovery…”), a **Discover Sources** button calling `POST /api/pipeline/discover-sources`, and optional rationale text if/when that column exists.

### Tests

```
__tests__/agents/discover-sources.test.ts
  - returns proposed count when LLM returns valid feeds
  - skips feeds already in research_sources for workspace
  - skips duplicate feed URLs within single LLM response
  - returns skipped count for duplicates
  - handles empty LLM response (no feeds found)
  - does not insert sources with malformed feed URLs

__tests__/api/discover-sources-route.test.ts
  - returns ok: true with proposed count
  - returns skipped: true when ran within 24 hours
  - returns 401 when not authenticated
```

### Acceptance Criteria

- [ ] `POST /api/pipeline/discover-sources` returns `{ ok: true, proposed: N }`
- [x] Proposed sources appear in Research Setup tab *(UI shipped; population still pending)*
- [x] Approve/Reject buttons work (existing routes + UI)
- [ ] Runs are logged to `runs` table with `run_type = "agent:researcher:discover"`
- [ ] Rate limit prevents re-running within 24 hours
- [ ] All tests pass

---

## Phase 3 — Signal Scoring (Phase 2D-P3)

**Spec section:** §3.3 Phase 3  
**Priority:** Medium  
**Complexity:** Medium  
**Branch:** `claude/signal-scoring`  
**Prerequisite:** Phase 2D-P1 shipped (✅); Phase 2 (Source Discovery) is independent  

### Objective

Add `score_signal_relevance()` tool to the Researcher Agent. After each ingest run, score new signals against the workspace Research Intent profile and store `relevance_score` (float 0.0–1.0) on the `signals` row. Surface `relevance_score` in the Signal Feed tab. Writer Agent orders signals by `relevance_score DESC` when generating leads.

### Database Migration

```sql
-- lib/supabase/schema-signal-scoring.sql
ALTER TABLE signals ADD COLUMN IF NOT EXISTS relevance_score FLOAT;
CREATE INDEX IF NOT EXISTS idx_signals_relevance ON signals(workspace_id, relevance_score DESC NULLS LAST);
```

### New Files

#### `lib/agents/tools/score-signals.ts`

```typescript
export async function scoreSignalsForWorkspace(
  workspaceId: string,
  signalIds: string[],
  supabase: SupabaseClient
): Promise<{ scored: number; failed: number }>
```

**Logic:**
1. Load `research_intent` for workspace
2. Load signal rows for `signalIds`
3. For each signal (or batch of 10), call `callLLM("research", prompt)` that asks: "Given this Research Intent profile and this signal (title + normalized_summary), return a relevance score 0.0-1.0 and one sentence of rationale. Return JSON: `{ score: number, rationale: string }`."
4. Update `signals.relevance_score` for each signal

### Files to Modify

#### `lib/agents/researcher.ts`

After successful ingest, call `scoreSignalsForWorkspace` for newly inserted signal IDs.

#### `lib/agents/writer.ts`

Change `query_fresh_signals` tool to order by `relevance_score DESC NULLS LAST, captured_at DESC` instead of just `captured_at DESC`.

#### `app/signals/page.tsx` — Signal Feed tab

Show `relevance_score` as a visual indicator (percentage or colored dot) on each signal card. Use existing heat bar pattern.

### Tests

```
__tests__/agents/score-signals.test.ts
  - scores signals based on research intent match
  - handles LLM returning invalid JSON gracefully
  - updates relevance_score in signals table
  - processes signals in batches (no more than 10 per LLM call)

__tests__/agents/writer-ordering.test.ts
  - query_fresh_signals orders by relevance_score DESC when available
  - falls back to captured_at DESC when all scores are null
```

### Acceptance Criteria

- [ ] `signals.relevance_score` column exists in DB (apply migration)
- [ ] After pipeline run, new signals have non-null `relevance_score`
- [ ] Signal Feed tab shows relevance indicator
- [ ] Writer Agent leads generation picks highest-scoring signals first
- [ ] All tests pass

---

## Phase 4 — Content Products Polish

**Spec section:** §3.11, §3.12  
**Priority:** Medium  
**Complexity:** Low–Medium  
**Branch:** `claude/content-products-polish`  
**Prerequisite:** None  

### Objective

Two improvements to the existing content products pipeline:

**4A — Podcast audio persistence:** When `persist=true` and `draftId` is provided, `POST /api/content-products/podcast-tts` saves the script JSON and audio file to Supabase storage, inserts a `podcast_episodes` row, and returns the episode ID. In-memory drafts still download only.

**4B — Multi-turn refinement UX:** After generating social snippets or podcast script, allow a short follow-up instruction ("make the X post shorter", "more technical tone") that sends `{ previousResult, instruction }` to the LLM and returns a refined version — without regenerating from scratch.

### 4A: Podcast Persistence

#### New Files

**`lib/supabase/schema-podcast-episodes.sql`** (if not already applied):

```sql
CREATE TABLE IF NOT EXISTS podcast_episodes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL,
  draft_id        UUID REFERENCES issue_drafts(id),
  script_json     JSONB NOT NULL,
  audio_url       TEXT,
  audio_ready     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### Modified Files

**`app/api/content-products/podcast-tts/route.ts`**

Accept `persist: boolean` and `draftId: string` in request body. When `persist=true` and `draftId` is set:
1. Upload MP3 to Supabase Storage bucket `PODCAST_AUDIO_STORAGE_BUCKET` at path `{workspaceId}/{episodeId}.mp3`
2. Insert `podcast_episodes` row with `script_json`, `audio_url`, `audio_ready=true`
3. Return `{ ok: true, episodeId, audioUrl }` instead of raw audio stream

When `persist=false` or `draftId` absent: existing download behavior unchanged.

### 4B: Multi-turn Refinement

#### New Route

**`app/api/content-products/social-snippets/refine/route.ts`**

```
POST /api/content-products/social-snippets/refine
Body: {
  previousSnippets: { x_post: string; linkedin_teaser: string; threads: string },
  instruction: string,   // max 200 chars
  brandProfileId?: string
}
Response: { ok: true, snippets: { x_post, linkedin_teaser, threads } }
```

Sends `previousSnippets + instruction` to LLM with instructions to refine the specific snippets per the instruction while keeping other snippets unchanged. Same brand profile context as the generate route.

**`app/api/content-products/podcast-script/refine/route.ts`**

Same pattern for podcast script refinement.

#### UI Changes

**`app/issues/page.tsx` (or social snippets component)**

After snippets are generated, show a text input: "Refine (e.g. shorter X post)..." with a Refine button. On submit, call the refine route and update the displayed snippets.

### Tests

```
__tests__/api/podcast-tts-persist.test.ts
  - persist=true + draftId inserts podcast_episodes row
  - persist=true + draftId uploads to storage
  - persist=false returns audio stream (existing behavior)
  - persist=true without draftId returns error

__tests__/api/social-snippets-refine.test.ts
  - applies instruction to previous snippets
  - passes brand profile context through
  - rejects instruction over 200 chars
```

### Acceptance Criteria

- [ ] `podcast_episodes` table schema applied
- [ ] Persist mode saves audio to storage and returns episode ID
- [ ] Refine endpoint returns modified snippets without full regeneration
- [ ] Refine UI input visible after initial generation
- [ ] All tests pass

---

## Phase 5 — LinkedIn Draft Engine

**Spec section:** §3.8, §8 Phase 3  
**Priority:** High (LinkedIn is a primary distribution channel)  
**Complexity:** High  
**Branch:** `claude/linkedin-draft-engine`  
**Prerequisite:** LinkedIn OAuth connection is implemented (✅ `linkedin_connections` table exists)  

### Objective

Enable LinkedIn draft generation from newsletter leads or newsletter sections. The Issues page gains a LinkedIn tab. Leads page gains a channel selector. The Editor Agent can produce LinkedIn-formatted drafts alongside or independently of newsletter drafts.

### Database

```sql
-- linkedin_drafts table already exists from Phase 2A M1
-- Confirm schema: workspace_id, content_json (LinkedInDraftObject), brand_profile_id, status
-- No new migration needed unless content_json shape changes
```

### `LinkedInDraftObject` Type

```typescript
// lib/draft/linkedin-content.ts
export type LinkedInDraftObject = {
  headline: string;         // 1-2 sentence hook
  body: string;             // full post body (1200-2000 chars)
  cta: string;              // call to action line
  hashtags: string[];       // 3-5 hashtags (no # prefix — added on render)
  image_prompt?: string;    // optional image generation prompt (Phase 2)
  metadata: {
    model: string;
    source_draft_id?: string;  // if generated from a newsletter draft
    tone: "thought_leadership" | "practitioner" | "narrative";
  };
};
```

### New API Routes

#### `app/api/linkedin/generate/route.ts`

```
POST /api/linkedin/generate
Auth: requireWorkspace()
Body: {
  leadIds?: string[],       // generate from specific leads
  sourceDraftId?: string,   // generate from newsletter draft sections
  brandProfileId?: string,
  tone?: "thought_leadership" | "practitioner" | "narrative"
}
Response: { ok: true, draftId: string, contentJson: LinkedInDraftObject }
```

**Generation logic:**
1. If `sourceDraftId`: load newsletter `content_json`, extract hook + thesis + deep_dive summary as input
2. If `leadIds`: load leads' `angle` field as input
3. Call `callLLM("linkedin", [systemMessage, userMessage])` to generate `LinkedInDraftObject`
4. Validate output shape (headline, body, cta, hashtags)
5. Insert `linkedin_drafts` row, return `{ draftId, contentJson }`

**System prompt for LinkedIn generation:**
- Same IDJ voice fingerprint as newsletter generation (pulled from brand profile)
- LinkedIn-specific constraints: no em dashes, first-person practitioner voice, open with a declarative statement (not a question), no listicles, body under 2000 chars, CTA is a subscription nudge or engagement prompt
- Return JSON with exact `LinkedInDraftObject` shape

#### `app/api/linkedin/regenerate/route.ts`

```
POST /api/linkedin/regenerate
Body: { draftId: string, instruction?: string }
Response: { ok: true, contentJson: LinkedInDraftObject }
```

Regenerates the full LinkedIn draft with optional steering instruction.

#### `app/api/linkedin/list/route.ts`

```
GET /api/linkedin/drafts
Response: { drafts: LinkedInDraft[] }  // with status, created_at, headline
```

#### `app/api/linkedin/publish/route.ts`

```
POST /api/linkedin/publish
Body: { draftId: string }
```

Uses the existing LinkedIn OAuth connection to post via LinkedIn API. Requires `linkedin_connections` row with valid access token. If token is expired, return `{ ok: false, error: "token_expired", reconnectUrl: "/api/auth/linkedin/start" }`.

### UI Changes

#### Issues page — LinkedIn tab

`app/issues/page.tsx`: Add "LinkedIn" tab alongside the existing newsletter view. Tab contains:
- "Generate from this draft" button (when a newsletter draft is loaded) → calls `/api/linkedin/generate` with `sourceDraftId`
- LinkedIn draft preview: `headline`, `body`, `cta`, hashtags rendered
- "Regenerate" and "Edit" controls
- "Post to LinkedIn" button (human-gated) → calls `/api/linkedin/publish`

#### Leads page — channel selector

`app/leads/page.tsx`: Add a channel badge per lead ("Newsletter" / "LinkedIn" / "Both"). Defaults to "Both". Selecting "LinkedIn only" sets `editorial_leads.channel = "linkedin"` (the `channel` column from spec §3.4).

### Tests

```
__tests__/api/linkedin-generate.test.ts
  - generates from newsletter draft sections
  - generates from lead angles
  - validates LinkedInDraftObject shape
  - inserts linkedin_drafts row on success
  - returns 400 when neither leadIds nor sourceDraftId provided

__tests__/api/linkedin-regenerate.test.ts
  - regenerates draft with instruction
  - updates linkedin_drafts row

__tests__/api/linkedin-publish.test.ts
  - calls LinkedIn API with correct auth
  - returns token_expired when connection is stale
  - marks draft status = 'published' on success

__tests__/lib/linkedin-content.test.ts
  - validates LinkedInDraftObject shape
  - renderLinkedInText() formats correctly (headline + body + CTA + hashtags)
```

### Acceptance Criteria

- [ ] `POST /api/linkedin/generate` returns valid `LinkedInDraftObject`
- [ ] LinkedIn tab visible on Issues page
- [ ] Generate from draft populates LinkedIn tab with draft
- [ ] Regenerate and Publish buttons work
- [ ] Token expiry handled gracefully with reconnect prompt
- [ ] `editorial_leads.channel` column used for filtering (apply migration if needed)
- [ ] All tests pass
- [ ] TypeScript clean

---

## Phase 6 — Blog / Longform Output (Phase 2C M2)

**Spec section:** §3.13 M2  
**Priority:** Lower — nice to have  
**Complexity:** Medium  
**Branch:** `claude/blog-longform`  
**Prerequisite:** Brainstorming Hub M1 shipped (✅)  

### Objective

Add `BlogDraftObject` as a first-class output format. A brainstorm session artifact or newsletter draft can be "promoted" to a long-form blog post via `POST /api/content-products/blog-draft`. The output is a structured Markdown article with SEO fields. The Issues page (or a new `/blog` page) allows Markdown/HTML export.

### `BlogDraftObject` Type

```typescript
// lib/draft/blog-content.ts
export type BlogDraftObject = {
  title: string;
  slug_hint: string;            // lowercase-hyphenated from title
  dek: string;                  // subtitle / meta description (1–2 sentences)
  body_markdown: string;        // full article in Markdown (1500–3000 words)
  cited_sources: { title?: string; url: string }[];
  metadata: {
    thesis: string;
    tags: string[];
    reading_time_minutes_estimate: number;
    model: string;
    source_type: "brainstorm_session" | "newsletter_draft";
    source_id: string;
  };
};
```

### Database

```sql
-- lib/supabase/schema-blog-drafts.sql
CREATE TABLE IF NOT EXISTS blog_drafts (
  id                           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id                 UUID NOT NULL,
  brand_profile_id             UUID,
  source_brainstorm_session_id UUID,
  source_newsletter_draft_id   UUID REFERENCES issue_drafts(id),
  content_json                 JSONB NOT NULL,
  status                       TEXT NOT NULL DEFAULT 'draft'
                                 CHECK (status IN ('draft', 'published')),
  created_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_blog_drafts_workspace ON blog_drafts(workspace_id, created_at DESC);
```

### New API Route

#### `app/api/content-products/blog-draft/route.ts`

```
POST /api/content-products/blog-draft
Auth: requireWorkspace()
Body: {
  brainstormSessionId?: string,
  newsletterDraftId?: string,
  brandProfileId?: string,
  targetWordCount?: number    // default 2000
}
Response: { ok: true, blogDraftId: string, contentJson: BlogDraftObject }
```

**Generation logic:**
1. If `brainstormSessionId`: load session messages, extract working outline + thesis + cited signal ids → build input context
2. If `newsletterDraftId`: load `content_json`, build expanded input (all sections as full text)
3. Call `callLLM("drafting", [...])` with blog-specific system prompt:
   - IDJ voice, longform register
   - SEO-aware structure (H2s, intro, body sections, conclusion)
   - Markdown output with backtick code blocks for technical terms
   - Return full `BlogDraftObject` JSON
4. Parse and validate `BlogDraftObject`
5. Compute `reading_time_minutes_estimate = Math.ceil(wordCount / 200)`
6. Generate `slug_hint = title.toLowerCase().replace(/[^a-z0-9]+/g, '-')`
7. Insert `blog_drafts` row, return `{ blogDraftId, contentJson }`

### UI

#### Blog section on Issues page (or `/blog` route)

Minimal: "Generate blog post from this draft" button on Issues page. On click, calls `POST /api/content-products/blog-draft` with `newsletterDraftId`. Shows preview of `dek` and first 200 chars of `body_markdown`. "Download Markdown" and "Copy HTML" buttons. No inline editor (export for editing in external tools).

### Tests

```
__tests__/api/blog-draft.test.ts
  - generates from newsletter draft with correct BlogDraftObject shape
  - generates from brainstorm session
  - computes slug_hint from title
  - estimates reading time correctly
  - inserts blog_drafts row on success
  - returns 400 when neither source provided

__tests__/lib/blog-content.test.ts
  - validates BlogDraftObject shape (required fields)
  - slug_hint generation handles special chars
```

### Acceptance Criteria

- [ ] `blog_drafts` table schema applied
- [ ] `POST /api/content-products/blog-draft` returns valid `BlogDraftObject`
- [ ] Markdown download works (correct `.md` file)
- [ ] HTML copy works (converts Markdown to basic HTML)
- [ ] All tests pass

---

## Appendix A: Environment Variables Reference

| Variable | Required By | Set In |
|----------|-------------|--------|
| `BEEHIIV_API_KEY` | Phase 1, Integrations | Railway + `.env.local` |
| `BEEHIIV_PUBLICATION_ID` | Phase 1, Integrations | Railway + `.env.local` |
| `TELEGRAM_BOT_TOKEN` | Phase 1, ACE | Railway + `.env.local` |
| `TELEGRAM_CHAT_ID` | Phase 1, ACE | Railway + `.env.local` |
| `PODCAST_AUDIO_STORAGE_BUCKET` | Phase 4A | Railway + `.env.local` |
| `CORNERSTONE_URL` | Phase 1 (optional) | Railway |
| `LLM_LINKEDIN` | Phase 5 | Railway (optional, falls back to global) |

---

## Appendix B: Test Infrastructure Notes

- Test runner: **Vitest** (`npm test`)
- All tests use `vi.mock()` for Supabase client — never hit real DB
- All tests use `vi.fn()` for `callLLM` — never hit real LLM APIs
- All tests use `vi.fn()` for `fetch` when testing HTTP calls to Beehiiv/Telegram/LinkedIn
- Pattern for mocking `fetch`: `vi.stubGlobal("fetch", vi.fn().mockResolvedValue(...))`
- Test file naming: `__tests__/{domain}/{feature}.test.ts`
- Each test file has `beforeEach(() => vi.clearAllMocks())`

---

## Appendix C: Branching and PR Convention

1. Branch from current `main` for each phase
2. Use branch name `claude/{phase-description}` (e.g. `claude/subscriber-health-pipeline`)
3. Commit with clear messages referencing the spec section
4. Do not open a PR unless the user explicitly asks
5. Push to remote: `git push -u origin claude/{phase-description}`
6. Each phase should be independently mergeable (no cross-phase imports until preceding phase is merged)

---

*Cornerstone OS Agent Execution Plan v1 — OnTheCorner Media*  
*System spec: Cornerstone OS v2.12 (`docs/cornerstone-system-spec.md`)*
