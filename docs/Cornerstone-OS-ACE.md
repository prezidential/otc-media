# Cornerstone OS — Autonomous Content Engine (ACE)
## Phase 1 Implementation Spec
### For Cursor Agent Execution

**Owner:** OnTheCorner Media  
**Base system (canonical narrative):** Cornerstone OS **v2.8** — [`docs/cornerstone-system-spec-v2.md`](cornerstone-system-spec-v2.md) **§3.14**  
**This document:** step-by-step build order, TypeScript sketches, Telegram behavior, env vars, and test matrix — use alongside the system spec.  
**Status:** Ready for implementation  
**Deployment target:** Railway (cron + webhook URLs)

---

## Overview

This spec extends Cornerstone OS **v2.8** (§3.14) to implement the **Autonomous Content Engine (ACE)** — a minimal-touch publishing loop that runs the full Research → Leads → Draft → Approval → Publish pipeline without requiring the creator to operate the system. The only required human interaction is a single tap in Telegram to approve or reject a draft before it publishes.

**Phase 1 scope:** Newsletter pipeline + Telegram approval gate. LinkedIn distribution is Phase 2.

**Design constraint:** All notification integrations must be implemented behind a pluggable `NotificationProvider` interface. Telegram is the first concrete implementation. No Telegram-specific logic should exist outside of `lib/notifications/providers/telegram.ts`. This is a SaaS product — future workspaces will connect Slack, email, or other channels.

---

## 1. Environment Variables

Add to `.env.local` and Railway environment configuration:

```env
# Notification provider selection (workspace-level in future; global for Phase 1)
NOTIFICATION_PROVIDER=telegram

# Telegram — only required when NOTIFICATION_PROVIDER=telegram
TELEGRAM_BOT_TOKEN=your-bot-token-from-botfather
TELEGRAM_CHAT_ID=your-personal-chat-id
TELEGRAM_WEBHOOK_SECRET=random-uuid-for-webhook-verification

# ACE scheduler auth
CRON_SECRET=random-uuid-for-cron-auth

# ACE feature flag
ACE_ENABLED=true
```

**Setup instructions:**

1. `TELEGRAM_BOT_TOKEN` — Message `@BotFather` on Telegram → `/newbot` → follow prompts → copy token
2. `TELEGRAM_CHAT_ID` — Message `@userinfobot` on Telegram → it returns your personal chat ID
3. After Railway deployment, register the webhook:
   ```
   POST https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/setWebhook
   Body: { "url": "https://your-app.railway.app/api/notifications/webhook/telegram", "secret_token": "{TELEGRAM_WEBHOOK_SECRET}" }
   ```

---

## 2. Database Schema

Apply all schema files in Supabase. All files are idempotent (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`).

### 2.1 Notification Approvals

**File: `lib/supabase/schema-notification-approvals.sql`**

```sql
CREATE TABLE IF NOT EXISTS notification_approvals (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      UUID NOT NULL,
  provider          TEXT NOT NULL DEFAULT 'telegram',
  entity_type       TEXT NOT NULL CHECK (entity_type IN ('newsletter_draft', 'linkedin_draft', 'lead_batch')),
  entity_id         UUID NOT NULL,
  provider_message_ref TEXT,             -- provider-specific message identifier
                                         -- Telegram: message_id (integer as text)
                                         -- Slack: ts string
                                         -- Email: message-id header
  status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
  preview_text      TEXT NOT NULL,       -- full preview sent to notification channel
  sent_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at      TIMESTAMPTZ,
  expires_at        TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '8 hours',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notification_approvals_status
  ON notification_approvals(status);

CREATE INDEX IF NOT EXISTS idx_notification_approvals_entity
  ON notification_approvals(entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_notification_approvals_workspace
  ON notification_approvals(workspace_id, status);
```

### 2.2 Content Lanes

**File: `lib/supabase/schema-content-lanes.sql`**

```sql
CREATE TABLE IF NOT EXISTS content_lanes (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id              UUID NOT NULL,
  name                      TEXT NOT NULL,
  slug                      TEXT NOT NULL,
  description               TEXT,
  audience                  TEXT,
  voice_guidance            TEXT,
  topics                    TEXT[] DEFAULT '{}',
  ring                      TEXT NOT NULL CHECK (ring IN ('inner', 'middle', 'outer')),
  target_frequency_per_month INTEGER DEFAULT 4,
  is_active                 BOOLEAN DEFAULT TRUE,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(workspace_id, slug)
);

-- Add lane tracking to existing tables
ALTER TABLE issue_drafts
  ADD COLUMN IF NOT EXISTS content_lane_id UUID REFERENCES content_lanes(id);

ALTER TABLE editorial_leads
  ADD COLUMN IF NOT EXISTS content_lane_id UUID REFERENCES content_lanes(id);
```

### 2.3 ACE Runs

**File: `lib/supabase/schema-ace-runs.sql`**

```sql
CREATE TABLE IF NOT EXISTS ace_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL,
  run_trigger     TEXT NOT NULL CHECK (run_trigger IN ('cron', 'manual', 'api')),
  status          TEXT NOT NULL DEFAULT 'running'
                    CHECK (status IN ('running', 'completed', 'failed', 'awaiting_approval', 'skipped')),
  pipeline_run_id UUID,
  draft_id        UUID REFERENCES issue_drafts(id),
  approval_id     UUID REFERENCES notification_approvals(id),
  summary         TEXT,
  error           TEXT,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ace_runs_workspace_status
  ON ace_runs(workspace_id, status);

CREATE INDEX IF NOT EXISTS idx_ace_runs_started
  ON ace_runs(started_at DESC);
```

---

## 3. Notification Provider Interface

**File: `lib/notifications/provider.ts`**

This is the core abstraction. All notification logic in the ACE must go through this interface. No provider-specific imports are allowed outside of `lib/notifications/providers/`.

```typescript
export type ApprovalPayload = {
  approvalId: string;
  entityType: 'newsletter_draft' | 'linkedin_draft' | 'lead_batch';
  entityId: string;
  headline: string;
  previewLines: string[];       // 3–5 lines rendered as preview body
  channel: string;              // e.g. "Identity Jedi Weekly"
  contentLane?: string;         // e.g. "AI × Identity"
};

export type ApprovalResponse = {
  approvalId: string;
  decision: 'approved' | 'rejected';
  respondedAt: string;          // ISO timestamp
};

export type StatusMessage = {
  level: 'info' | 'success' | 'warning' | 'error';
  title: string;
  body?: string;
  url?: string;                 // optional link to dashboard
};

export interface NotificationProvider {
  readonly id: string;          // 'telegram' | 'slack' | 'email' | 'sms'

  /**
   * Send an approval request to the creator.
   * Returns a provider-specific message reference stored in notification_approvals.provider_message_ref.
   * This ref is used to edit/update the message after the creator responds.
   */
  sendApprovalRequest(payload: ApprovalPayload): Promise<{ messageRef: string }>;

  /**
   * Send a status update (pipeline completed, error, skipped, etc.)
   */
  sendStatusUpdate(message: StatusMessage): Promise<void>;

  /**
   * Handle an inbound webhook payload from the provider.
   * Returns an ApprovalResponse if the payload contains an approval decision.
   * Returns null if the payload is not an approval response (e.g. a different event type).
   * Not all providers use webhooks — email providers may use signed link callbacks instead.
   */
  handleInbound?(
    body: unknown,
    headers: Record<string, string>
  ): Promise<ApprovalResponse | null>;
}
```

### 3.1 Provider Factory

**File: `lib/notifications/factory.ts`**

```typescript
import { NotificationProvider } from './provider';

export type WorkspaceNotificationConfig = {
  provider: 'telegram' | 'slack' | 'email' | 'sms';
  config: Record<string, string>;   // provider-specific credentials/settings
};

/**
 * Returns the correct NotificationProvider implementation for a workspace.
 * Phase 1: reads from environment variables.
 * Phase 2+: reads from workspace settings table (multi-tenant).
 */
export function getNotificationProvider(
  workspaceConfig?: WorkspaceNotificationConfig
): NotificationProvider

/**
 * Phase 1 helper: build config from environment variables.
 * Called internally when workspaceConfig is not provided.
 */
export function getProviderFromEnv(): NotificationProvider
```

Implementation notes:
- Phase 1: `getProviderFromEnv()` reads `NOTIFICATION_PROVIDER` env var, returns `TelegramProvider` when value is `'telegram'`
- Phase 2: `getNotificationProvider(config)` switches on `config.provider` to return the correct implementation
- Throw a typed `ConfigurationError` if required credentials are missing — do not silently fail

---

## 4. Telegram Provider Implementation

**File: `lib/notifications/providers/telegram.ts`**

Implements `NotificationProvider` for Telegram Bot API.

```typescript
export class TelegramProvider implements NotificationProvider {
  readonly id = 'telegram';

  constructor(private config: {
    botToken: string;
    chatId: string;
    webhookSecret: string;
  }) {}
```

### 4.1 `sendApprovalRequest` behavior

Message format sent to Telegram (use `parse_mode: 'HTML'`):

```
🗞️ <b>Newsletter Draft Ready</b>

<b>Channel:</b> Identity Jedi Weekly
<b>Lane:</b> AI × Identity

<b>Hook:</b>
[previewLines[0]]
[previewLines[1]]

<b>Thesis:</b> [previewLines[2]]

Expires in 8 hours.
```

Inline keyboard buttons (`reply_markup.inline_keyboard`):

```json
[[
  { "text": "✅ Approve", "callback_data": "approve:{approvalId}" },
  { "text": "❌ Reject",  "callback_data": "reject:{approvalId}" }
]]
```

Returns `{ messageRef: message_id.toString() }`.

### 4.2 `sendStatusUpdate` behavior

Maps `StatusMessage.level` to emoji prefix:
- `info` → ℹ️
- `success` → ✅
- `warning` → ⚠️
- `error` → 🚨

Sends as plain text message to `chatId`.

### 4.3 `handleInbound` behavior

Handles two Telegram update types:

**`callback_query`** (inline keyboard tap — primary path):
- Parse `callback_data`: `"approve:{approvalId}"` or `"reject:{approvalId}"`
- Verify `approvalId` exists and is not expired
- Answer the callback query immediately (`answerCallbackQuery`) to remove the loading spinner
- Edit the original message to replace inline keyboard with result text:
  - Approved: `✅ Approved — publishing now`
  - Rejected: `❌ Rejected`
- Return `ApprovalResponse`

**`message`** (text command — fallback):
- Handle `/approve_{approvalId}` and `/reject_{approvalId}` text patterns
- Same logic as callback_query path, no message edit needed

**Webhook verification:**
- Check `X-Telegram-Bot-Api-Secret-Token` header matches `TELEGRAM_WEBHOOK_SECRET`
- Return 401 if missing or mismatched — do not process the update

**Always return HTTP 200 to Telegram** even if processing fails internally. Log errors and send `sendStatusUpdate` with error level. Telegram will retry if it receives non-200.

---

## 5. Inbound Webhook Endpoint

**File: `app/api/notifications/webhook/[provider]/route.ts`**

```typescript
// POST /api/notifications/webhook/telegram
// POST /api/notifications/webhook/slack      (Phase 2)
// POST /api/notifications/webhook/email      (Phase 2)

// Routing logic:
// 1. Extract provider slug from [provider] param
// 2. Get provider instance from factory
// 3. Call provider.handleInbound(body, headers)
// 4. If ApprovalResponse returned:
//    a. Load notification_approvals row — verify status is 'pending' and not expired
//    b. Update row: status, responded_at
//    c. If approved AND entity_type === 'newsletter_draft':
//       - Call POST /api/publish/beehiiv internally with { draftId: entity_id }
//       - On success: send statusUpdate { level: 'success', title: 'Published', body: title, url: beehiiv_web_url }
//       - On failure: send statusUpdate { level: 'error', title: 'Publish failed', body: error }
//       - Update ace_runs row to 'completed' or 'failed'
//    d. If rejected:
//       - Send statusUpdate { level: 'info', title: 'Draft rejected', body: 'Open dashboard to edit or regenerate.' }
//       - Update ace_runs row to 'failed' (no content went out)
// 5. Always return { ok: true } with HTTP 200
```

---

## 6. ACE Orchestrator

**File: `lib/ace/orchestrator.ts`**

Top-level controller for the autonomous loop. Wraps the existing Pipeline Orchestrator and adds approval gate.

```typescript
export type AceRunOptions = {
  workspaceId: string;
  trigger: 'cron' | 'manual' | 'api';
  stages?: ('research' | 'leads' | 'draft' | 'notify')[];
  forceRerun?: boolean;         // bypass staleness guard
};

export type AceRunResult = {
  runId: string;
  status: 'completed' | 'awaiting_approval' | 'skipped' | 'failed';
  summary: string;
  draftId?: string;
  approvalId?: string;
  error?: string;
};

export async function runAce(options: AceRunOptions): Promise<AceRunResult>
```

### 6.1 Execution Sequence

```
Pre-flight checks (skip if forceRerun: true):
  a. Is ACE_ENABLED=true? If not, return { status: 'skipped', summary: 'ACE disabled' }
  b. Is there already a pending notification_approval for this workspace? 
     If yes, return { status: 'skipped', summary: 'Awaiting approval on existing draft' }
  c. Did an ACE run complete successfully in the last 20 hours?
     If yes, return { status: 'skipped', summary: 'Pipeline ran recently' }

1. Insert ace_runs row (status: 'running')

2. Call POST /api/pipeline/run internally
   Body: { stages: ['researcher', 'writer', 'editor'], triggered_by: 'ace:{trigger}', returnDraftId: true }
   
3. Evaluate pipeline result:

   CASE A — new draft produced (pipeline returns draftId):
     a. Load draft from issue_drafts
     b. Get lane balance report from getLaneBalance()
     c. Build ApprovalPayload:
        - headline: '🗞️ Newsletter Draft Ready'
        - previewLines: [draft.hook_paragraphs[0], draft.hook_paragraphs[1], draft.metadata.thesis]
        - channel: brand profile name
        - contentLane: resolved from content_lane_id if set
     d. Insert notification_approvals row (status: 'pending', expires_at: NOW() + 8h)
     e. Call provider.sendApprovalRequest(payload)
     f. Store returned messageRef in notification_approvals.provider_message_ref
     g. Update ace_runs: status='awaiting_approval', draft_id, approval_id
     h. Return { status: 'awaiting_approval', draftId, approvalId }

   CASE B — no new draft (pipeline ran but Editor refused due to insufficient leads):
     a. Send statusUpdate: { level: 'info', title: 'ACE ran — no draft needed',
        body: '{n} leads in queue. Needs {x} more approved leads to draft.' }
     b. Update ace_runs: status='skipped'
     c. Return { status: 'skipped' }

   CASE C — pipeline error:
     a. Send statusUpdate: { level: 'error', title: 'ACE pipeline failed', body: error.message }
     b. Update ace_runs: status='failed', error: error.message
     c. Return { status: 'failed', error: error.message }
```

### 6.2 Pipeline Orchestrator contract change

The existing `POST /api/pipeline/run` must be updated to accept `returnDraftId: boolean` in the request body and include the generated `draftId` in the response when `returnDraftId: true`. This is a non-breaking additive change.

---

## 7. Lane Balance Enforcer

**File: `lib/ace/lane-balance.ts`**

Checks content lane distribution to enforce the 50% Inner Ring rule and per-lane cadence targets.

```typescript
export type LaneBalanceReport = {
  laneId: string;
  laneName: string;
  slug: string;
  ring: 'inner' | 'middle' | 'outer';
  targetPerMonth: number;
  actualLast30Days: number;
  deltaFromTarget: number;      // negative = underproduced, positive = overproduced
  priority: number;             // 0–100, higher = more urgent to produce
  overdue: boolean;
};

export type BalanceSummary = {
  lanes: LaneBalanceReport[];
  innerRingPercent: number;     // % of last 30 days output that is inner ring
  innerRingFloorMet: boolean;   // true if innerRingPercent >= 50
  highestPriorityLane: LaneBalanceReport;
};

/**
 * Query issue_drafts for last 30 days, compute distribution per lane.
 * Rank lanes by priority (most behind target = highest priority).
 */
export async function getLaneBalance(workspaceId: string): Promise<BalanceSummary>

/**
 * Returns true if inner ring content is >= 50% of output in last 30 days.
 * If false, ACE should force next draft to prioritize inner ring leads.
 */
export async function enforceInnerRingFloor(workspaceId: string): Promise<boolean>
```

The `BalanceSummary` is passed to the Editor Agent as additional context alongside approved leads. Include it in the pipeline run request body as `laneBalanceContext` when called from ACE.

---

## 8. Content Lanes Seed

**File: `lib/content-lanes/seed.ts`**  
**File: `app/api/content-lanes/seed/route.ts`**

```typescript
// POST /api/content-lanes/seed
// Idempotent — skips lanes that already exist for the workspace (by slug)
// Returns { created: string[], skipped: string[] }
```

Default lanes for David Lee / Identity Jedi workspace. These are configured as any other creator would configure their own lanes — no hardcoded workspace ID. The seed endpoint reads `WORKSPACE_ID` from env.

```typescript
const DEFAULT_LANES = [
  {
    name: 'IAM Core',
    slug: 'iam-core',
    ring: 'inner',
    description: 'Identity and access management practitioner content',
    audience: 'IAM engineers, identity architects, IGA/PAM analysts',
    voice_guidance: 'Practitioner-to-peer. Tactical, real-world. Grounded in operational experience. No vendor-speak.',
    topics: ['IGA', 'PAM', 'zero trust', 'identity governance', 'access management', 'ITDR', 'CIEM', 'RBAC', 'SoD'],
    target_frequency_per_month: 8
  },
  {
    name: 'AI × Identity',
    slug: 'ai-identity',
    ring: 'middle',
    description: 'Intersection of AI adoption and enterprise identity infrastructure',
    audience: 'AI practitioners, CTOs, security architects, enterprise IT leaders',
    voice_guidance: 'Bridge voice — explain identity implications of AI to a technically literate but non-IAM audience. Lead with the enterprise risk angle.',
    topics: ['non-human identities', 'agentic AI', 'machine identity', 'AI access governance', 'NHI', 'AI agents', 'LLM security'],
    target_frequency_per_month: 4
  },
  {
    name: 'Practitioner to Leader',
    slug: 'practitioner-to-leader',
    ring: 'middle',
    description: 'Career and leadership content for senior practitioners transitioning to executive roles',
    audience: 'Senior engineers, architects, directors moving into CXO or VP-level roles',
    voice_guidance: 'Autobiographical authority. Personal trajectory as proof. Experiential not prescriptive. Not a listicle.',
    topics: ['executive buy-in', 'technical leadership', 'influence without authority', 'program strategy', 'Field CTO', 'career transition'],
    target_frequency_per_month: 2
  },
  {
    name: 'B2B Creator',
    slug: 'b2b-creator',
    ring: 'outer',
    description: 'Building a B2B thought leadership brand as a technical practitioner',
    audience: 'B2B professionals, consultants, technical practitioners building personal brands',
    voice_guidance: 'Document the build. Receipts over claims. Show the system, not just the outcome. No generic creator advice.',
    topics: ['thought leadership', 'B2B content', 'personal brand', 'content systems', 'creator economy', 'newsletter', 'podcast'],
    target_frequency_per_month: 2
  },
  {
    name: 'Enterprise Program Building',
    slug: 'enterprise-programs',
    ring: 'middle',
    description: 'Standing up and scaling enterprise security and technology programs',
    audience: 'Security practitioners, program managers, enterprise IT leaders in GRC, cloud security, and adjacent domains',
    voice_guidance: 'Program architect perspective. Cross-functional. Outcomes-first. Applicable beyond identity.',
    topics: ['GRC', 'cloud security', 'zero trust programs', 'data governance', 'enterprise architecture', 'risk management'],
    target_frequency_per_month: 2
  }
];
```

---

## 9. Scheduled Cron Trigger

**File: `app/api/ace/cron/route.ts`**

```typescript
// POST /api/ace/cron
// Called by Railway cron scheduler on configured schedule

export async function POST(req: Request) {
  // 1. Verify Authorization header: Bearer {CRON_SECRET}
  //    Return 401 if missing or mismatched
  
  // 2. Check ACE_ENABLED — return 200 { ok: true, skipped: true } if false
  
  // 3. Call runAce({ workspaceId: process.env.WORKSPACE_ID, trigger: 'cron' })
  
  // 4. Return { ok: true, result }
  // Always return 200 — Railway will log the response body for monitoring
}
```

**Railway cron configuration** (set in Railway dashboard → your service → Settings → Cron):

| Field | Value |
|---|---|
| Schedule | `0 8 * * 1-5` |
| Command | `curl -s -X POST https://your-app.railway.app/api/ace/cron -H "Authorization: Bearer $CRON_SECRET"` |

Note: `0 8 * * 1-5` runs at 8:00 AM UTC Monday–Friday. Adjust offset for your preferred local time (e.g. `0 13 * * 1-5` for 8 AM ET / UTC-5).

For Railway specifically: set `CRON_SECRET` as an environment variable in Railway dashboard under the same service. Railway injects it into the cron command via `$CRON_SECRET`.

---

## 10. Manual Trigger Endpoint

**File: `app/api/ace/run/route.ts`**

```typescript
// POST /api/ace/run
// Manual trigger from ACE dashboard or external API call

// Request body (all optional):
// {
//   stages?: ('research' | 'leads' | 'draft' | 'notify')[],
//   forceRerun?: boolean
// }

// Returns AceRunResult
```

---

## 11. ACE Dashboard Page

**File: `app/ace/page.tsx`**

Add `Ace` to sidebar navigation. Page shows:

**Current Status panel:**
- Last ACE run: relative timestamp, status badge (completed / awaiting_approval / skipped / failed), summary text
- Next scheduled run: derived from cron schedule

**Approval Queue panel:**
- List of `pending` notification_approvals for workspace
- Per item: entity type, draft title, lane, sent_at, expires_at countdown
- "Open Draft" link to Issues page for that draftId

**Lane Balance panel:**
- Visual bar per lane: actual vs. target this month
- Inner Ring floor indicator: current % with green/red status
- Data from `getLaneBalance()`

**Controls:**
- "Run ACE Now" button → `POST /api/ace/run`
- ACE enabled/disabled toggle → reads/writes `ACE_ENABLED` (or a DB flag in Phase 2)

**Run History panel:**
- Last 10 `ace_runs` rows: trigger, status, summary, started_at, duration
- Link to full pipeline run for each

---

## 12. Modifications to Existing Files

### 12.1 `app/api/pipeline/run/route.ts`

Add to accepted request body:
```typescript
returnDraftId?: boolean     // when true, include generated draftId in response
laneBalanceContext?: BalanceSummary   // passed through to Editor Agent
```

Add to response body when `returnDraftId: true`:
```typescript
draftId?: string            // UUID of generated issue_draft, null if no draft produced
```

### 12.2 `lib/agents/editor.ts`

Add to agent run context:
```typescript
laneBalanceContext?: BalanceSummary
```

When `laneBalanceContext` is provided:
- If `innerRingFloorMet === false`, filter lead candidates to prefer IAM Core lane leads before selecting for the draft
- If a specific lane is `highestPriorityLane` and has relevant approved leads, bias selection toward those leads
- Include the resolved `content_lane_id` in the draft generation output and write it to `issue_drafts.content_lane_id`

### 12.3 `app/api/publish/beehiiv/route.ts`

After successful publish, perform two additional actions:
1. Update the `ace_runs` row associated with this draft's approval: set `status = 'completed'`, `completed_at = NOW()`
2. Call `provider.sendStatusUpdate({ level: 'success', title: '✅ Published', body: draft.title, url: beehiiv_web_url })`

Look up the relevant `ace_runs` row by joining `notification_approvals` on `entity_id = draftId`.

---

## 13. Test Coverage Requirements

New test files:

```
__tests__/
├── ace/
│   ├── orchestrator.test.ts
│   │   # runAce() happy path (produces draft → approval sent)
│   │   # runAce() skipped: ACE disabled
│   │   # runAce() skipped: pending approval exists
│   │   # runAce() skipped: ran recently (staleness guard)
│   │   # runAce() case B: pipeline ran, no draft produced
│   │   # runAce() case C: pipeline error
│   │   # forceRerun: true bypasses staleness guard
│   │
│   ├── lane-balance.test.ts
│   │   # getLaneBalance(): correct distribution calculation
│   │   # getLaneBalance(): handles workspace with no drafts
│   │   # enforceInnerRingFloor(): returns true when >= 50% inner ring
│   │   # enforceInnerRingFloor(): returns false when < 50% inner ring
│   │   # priority ranking: most overdue lane ranks highest
│
├── notifications/
│   ├── provider.test.ts
│   │   # factory returns TelegramProvider when NOTIFICATION_PROVIDER=telegram
│   │   # factory throws ConfigurationError when credentials missing
│   │
│   ├── telegram.test.ts
│   │   # sendApprovalRequest(): correct message format
│   │   # sendApprovalRequest(): inline keyboard callback_data format
│   │   # handleInbound(): callback_query approve path
│   │   # handleInbound(): callback_query reject path
│   │   # handleInbound(): webhook secret verification (valid + invalid)
│   │   # handleInbound(): expired approval returns null, sends error
│   │   # handleInbound(): unknown callback_data returns null
│   │   # sendStatusUpdate(): correct emoji prefix per level
│
├── api/
│   ├── ace-cron.test.ts
│   │   # returns 401 without CRON_SECRET
│   │   # returns 200 skipped when ACE_ENABLED=false
│   │   # calls runAce with trigger: 'cron'
│   │
│   ├── ace-run.test.ts
│   │   # manual trigger calls runAce with trigger: 'manual'
│   │   # passes forceRerun and stages through
│   │
│   ├── notification-webhook.test.ts
│   │   # routes to correct provider by [provider] param
│   │   # approve flow: updates approval, calls beehiiv publish
│   │   # reject flow: updates approval, sends status update
│   │   # expired approval: skips, sends error notification
│   │   # always returns 200
│   │
│   ├── content-lanes-seed.test.ts
│   │   # seeds all 5 default lanes on empty workspace
│   │   # skips existing lanes (idempotent)
│   │   # returns created/skipped counts
```

---

## 14. Implementation Sequence for Cursor

Execute strictly in this order. Each step should be independently committed and tested before proceeding.

| Step | File(s) | Notes |
|---|---|---|
| 1 | Supabase: apply all 3 schema files | `notification-approvals`, `content-lanes`, `ace-runs` |
| 2 | `lib/notifications/provider.ts` | Interface only — no implementations yet |
| 3 | `lib/notifications/factory.ts` | Factory + `getProviderFromEnv()` |
| 4 | `lib/notifications/providers/telegram.ts` | Telegram implementation |
| 5 | `__tests__/notifications/` | Tests for provider + telegram |
| 6 | `app/api/notifications/webhook/[provider]/route.ts` | Inbound webhook router |
| 7 | `__tests__/api/notification-webhook.test.ts` | Webhook tests |
| 8 | `lib/content-lanes/seed.ts` + `app/api/content-lanes/seed/route.ts` | Seed endpoint |
| 9 | `__tests__/api/content-lanes-seed.test.ts` | Seed tests |
| 10 | `lib/ace/lane-balance.ts` | Lane balance logic |
| 11 | `__tests__/ace/lane-balance.test.ts` | Lane balance tests |
| 12 | Patch `app/api/pipeline/run/route.ts` | Add `returnDraftId` + `laneBalanceContext` |
| 13 | Patch `lib/agents/editor.ts` | Accept lane balance context |
| 14 | `lib/ace/orchestrator.ts` | ACE orchestrator |
| 15 | `__tests__/ace/orchestrator.test.ts` | Orchestrator tests |
| 16 | `app/api/ace/cron/route.ts` | Cron endpoint |
| 17 | `app/api/ace/run/route.ts` | Manual trigger endpoint |
| 18 | `__tests__/api/ace-cron.test.ts` + `ace-run.test.ts` | Cron + manual trigger tests |
| 19 | Patch `app/api/publish/beehiiv/route.ts` | Post-publish ACE status update |
| 20 | `app/ace/page.tsx` | ACE dashboard, add to sidebar nav |
| 21 | Railway config | Set env vars, configure cron, register Telegram webhook |
| 22 | End-to-end test | Manual trigger → confirm Telegram message arrives → tap Approve → confirm Beehiiv draft created → confirm Telegram confirmation received |

---

## 15. Phase 1 Out of Scope

The following are explicitly deferred to Phase 2 ACE:

- LinkedIn draft generation and distribution
- Signal source expansion beyond existing RSS directives (Google Trends API, non-IAM feeds)
- Performance data ingestion (LinkedIn Analytics, Beehiiv open/click rates)
- Feedback loop: performance data influencing content lane weighting
- Scheduling optimization based on historical engagement data
- Multi-tenant notification provider configuration (per-workspace provider selection)
- Slack, email, and SMS notification provider implementations

---

## 16. SaaS Readiness Notes

The following architectural decisions ensure Phase 1 does not create SaaS migration debt:

1. **`NotificationProvider` interface** — Telegram is swappable. Future workspaces select their provider via `WorkspaceNotificationConfig`. No Telegram logic leaks into orchestrator or webhook router.

2. **`notification_approvals.provider` column** — All providers write to the same table. Analytics, audit trail, and approval logic are provider-agnostic.

3. **`/api/notifications/webhook/[provider]` routing** — One endpoint pattern handles all current and future providers without new routes.

4. **Content lanes as workspace data, not system config** — Lanes are DB rows scoped to `workspace_id`. Any creator configures their own lanes via the seed endpoint or future onboarding UI. David's 5 lanes are his configuration, not the system's.

5. **`WORKSPACE_ID` env var** — Phase 1 is single-tenant by env config. Phase 2 multi-tenancy replaces this with request-scoped workspace resolution without changing any of the underlying logic.

---

*Cornerstone OS ACE Phase 1 Spec — OnTheCorner Media*  
*System spec: Cornerstone OS v2.8 (`docs/cornerstone-system-spec-v2.md`)*