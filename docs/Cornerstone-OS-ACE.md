# Cornerstone OS — Autonomous Content Engine (ACE)
## Implementation Spec and Operator Runbook

**Owner:** OnTheCorner Media  
**Base system (canonical narrative):** [`docs/cornerstone-system-spec.md`](cornerstone-system-spec.md) **§3.14**
**This document:** source-backed runbook for ACE routes, Telegram behavior, env vars, and operational constraints.
**Status:** Implemented. Phase 1 shipped; Phase 2A M2 removed the single-tenant `WORKSPACE_ID` route model.
**Deployment target:** Any Next.js deployment with cron support or an external scheduler.

---

## Overview

This runbook covers the **Autonomous Content Engine (ACE)** — a minimal-touch publishing loop that runs the Researcher -> Writer -> Editor pipeline, sends a Telegram approval request, and publishes only after the creator approves the draft. The only required human interaction is a Telegram approve/reject action before publish.

**Current scope:** Newsletter pipeline + Telegram approval gate + Beehiiv draft creation after approval. LinkedIn distribution remains deferred.

**Design constraint:** All notification integrations go through the pluggable `NotificationProvider` interface. Telegram is the first concrete implementation. No Telegram-specific logic should exist outside of `lib/notifications/providers/telegram.ts`.

---

## 1. Environment Variables

Add to `.env.local` and the deployed app environment:

```env
# Notification provider selection (global env-backed in the current implementation)
NOTIFICATION_PROVIDER=telegram

# Telegram — only required when NOTIFICATION_PROVIDER=telegram
TELEGRAM_BOT_TOKEN=your-bot-token-from-botfather
TELEGRAM_CHAT_ID=your-personal-chat-id
TELEGRAM_WEBHOOK_SECRET=random-uuid-for-webhook-verification

# ACE scheduler auth
CRON_SECRET=random-uuid-for-cron-auth

# ACE global kill switch. Scheduled runs also require workspace_settings.ace_enabled=true.
ACE_ENABLED=true

# Optional internal URL used when runAce() calls /api/pipeline/run.
# Defaults to VERCEL_URL, then http://localhost:3000.
INTERNAL_APP_URL=https://your-app.example.com
```

**Setup instructions:**

1. `TELEGRAM_BOT_TOKEN` — Message `@BotFather` on Telegram → `/newbot` → follow prompts → copy token
2. `TELEGRAM_CHAT_ID` — Message `@userinfobot` on Telegram → it returns your personal chat ID
3. Apply `lib/supabase/schema-workspace-settings.sql`, then set `workspace_settings.ace_enabled = true` for each workspace that should run on the scheduler.
4. After deployment, register one Telegram webhook per workspace:
   ```
   POST https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/setWebhook
   Body: { "url": "https://your-app.example.com/api/notifications/webhook/telegram/{workspaceId}", "secret_token": "{TELEGRAM_WEBHOOK_SECRET}" }
   ```

The legacy `/api/notifications/webhook/{provider}` URL returns `410 Gone`. Re-register existing Telegram webhooks with the workspace-scoped path after migrating from the old single-tenant deployment.

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

**File: `app/api/notifications/webhook/[provider]/[workspaceId]/route.ts`**

```typescript
// POST /api/notifications/webhook/telegram/{workspaceId}
// POST /api/notifications/webhook/slack/{workspaceId}      (future)
// POST /api/notifications/webhook/email/{workspaceId}      (future)

// Routing logic:
// 1. Extract provider slug from [provider] param
// 2. Extract workspaceId from [workspaceId] param
// 3. Get provider instance from factory
// 4. Call provider.handleInbound(body, headers)
// 5. If ApprovalResponse returned:
//    a. Load notification_approvals row
//    b. Verify the row workspace_id matches the path workspaceId
//    c. Verify status is 'pending' and not expired
//    d. Update row: status, responded_at
//    e. If approved AND entity_type === 'newsletter_draft':
//       - Render draft HTML
//       - Create the Beehiiv draft via createBeehiivDraft()
//       - Send statusUpdate { level: 'success', title: 'Published', body: title, url: beehiiv_web_url }
//       - Update ace_runs row to 'completed' or 'failed'
//    f. If rejected:
//       - Send statusUpdate { level: 'info', title: 'Draft rejected', body: 'Open dashboard to edit or regenerate.' }
//       - Update ace_runs row to 'failed' (no content went out)
// 6. Return { ok: true } for ignored/replayed callbacks
```

The legacy `app/api/notifications/webhook/[provider]/route.ts` exists only as a migration guard and returns `410 Gone` so stale webhook registrations fail loudly.

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

Default lanes for David Lee / Identity Jedi workspace. These are configured as any other creator would configure their own lanes — no hardcoded workspace ID. The seed endpoint is authenticated and resolves the active workspace through `requireWorkspace()`.

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
// Called by a cron scheduler on configured schedule

export async function POST(req: Request) {
  // 1. Verify Authorization header: Bearer {CRON_SECRET}
  //    Return 401 if missing or mismatched
  
  // 2. Query workspace_settings for rows where ace_enabled=true
  
  // 3. For each opted-in workspace, call runAce({ workspaceId, trigger: 'cron' })
  
  // 4. Return { ok: true, count, results }
}
```

**Example external cron configuration**:

| Field | Value |
|---|---|
| Schedule | `0 8 * * 1-5` |
| Command | `curl -s -X POST https://your-app.example.com/api/ace/cron -H "Authorization: Bearer $CRON_SECRET"` |

Note: `0 8 * * 1-5` runs at 8:00 AM UTC Monday–Friday. Adjust offset for your preferred local time (e.g. `0 13 * * 1-5` for 8 AM ET / UTC-5).

The scheduler route's workspace selection is controlled by `workspace_settings.ace_enabled`. `runAce()` still checks the global `ACE_ENABLED` kill switch, so both gates must be enabled for scheduled work to proceed.

---

## 10. Manual Trigger Endpoint

**File: `app/api/ace/run/route.ts`**

```typescript
// POST /api/ace/run
// Manual trigger from ACE dashboard

// Request body (all optional):
// {
//   forceRerun?: boolean
// }

// Returns AceRunResult
```

Authenticated browser calls resolve the workspace from the active session via `requireWorkspace()`. Internal callers may pass `Authorization: Bearer ${CRON_SECRET}` plus `{ workspaceId }`, but the public scheduler should generally call `/api/ace/cron` instead.

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
- Status chip reads the global `ACE_ENABLED` environment flag. The per-workspace scheduled opt-in lives in `workspace_settings.ace_enabled` and is not toggled by the current dashboard.

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
│   │   # returns skipped response when no workspace has ace_enabled=true
│   │   # calls runAce once per opted-in workspace with trigger: 'cron'
│   │
│   ├── ace-run.test.ts
│   │   # manual trigger calls runAce with trigger: 'manual'
│   │   # passes forceRerun through
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
| 6 | `app/api/notifications/webhook/[provider]/[workspaceId]/route.ts` | Inbound webhook router |
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
| 21 | Scheduler config | Set env vars, configure cron, register per-workspace Telegram webhook |
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

3. **`/api/notifications/webhook/[provider]/[workspaceId]` routing** — One endpoint pattern handles all current and future providers while keeping inbound callbacks workspace-scoped. The provider signature still proves authenticity; the path workspace id is cross-checked against the approval row.

4. **Content lanes as workspace data, not system config** — Lanes are DB rows scoped to `workspace_id`. Any creator configures their own lanes via the seed endpoint or future onboarding UI. David's 5 lanes are his configuration, not the system's.

5. **No `WORKSPACE_ID` runtime dependency** — User-triggered ACE routes resolve the workspace from the Supabase session; scheduled ACE routes iterate `workspace_settings.ace_enabled=true`; webhooks embed the workspace id in the URL path.

---

*Cornerstone OS ACE Phase 1 Spec — OnTheCorner Media*  
*System spec: Cornerstone OS v2.8 (`docs/cornerstone-system-spec.md`)*