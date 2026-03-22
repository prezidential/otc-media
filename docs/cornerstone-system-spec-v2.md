# Cornerstone OS
## System Specification v2.1

Owner: OnTheCorner Media  
Module: Newsroom Engine + LinkedIn Module  
Status: Active Development  
Supersedes: v2.0 (sections marked **[REVISED]** replace v2.0 equivalents; sections marked **[NEW]** are additive)

---

# 1. Core Mission [REVISED]

Cornerstone OS exists to eliminate blank page friction and transform research into structured, voice-consistent, monetizable media assets — for any B2B thought leadership creator.

It must:

- Ingest research autonomously
- Extract structured editorial angles
- Generate viewpoint-driven drafts
- Enforce per-creator writing constraints
- Support modular section regeneration
- Persist structured draft objects
- Prepare publish-ready drafts across multiple output channels
- Support multiple creators via workspace-scoped configuration
- **Operate as a team of specialized agents, not a sequence of button clicks**

It is infrastructure, not a chatbot. It is a product, not a single-creator tool. It is a newsroom, not a prompt template.

---

# 2. Design Principles [REVISED]

1. Structured over freeform
2. Modular over monolithic
3. Deterministic over magical
4. Persist state, do not recompute everything
5. Human approval before publish
6. Voice guardrails enforced at system level
7. Replaceable LLM abstraction
8. Creator-configured, not system-hardcoded
9. API-connected over file import
10. Workspace-scoped by default
11. **Agents over endpoints** — each pipeline stage is an autonomous agent with tools, memory, and judgment — not a dumb prompt call
12. **Human gates, not human labor** — humans approve, they don't operate

---

# 3. System Architecture [REVISED]

## 3.0 Multi-Tenancy Model
_Unchanged from v2.0._

---

## 3.1 Agent Architecture [NEW]

### Overview

Cornerstone OS operates as a **newsroom staffed by specialized agents**. Each agent has a defined role, a set of tools it can invoke, memory of its previous runs, and the ability to make autonomous decisions within its scope.

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Researcher  │────▶│    Writer     │────▶│    Editor     │────▶│  Publisher   │
│              │     │              │     │              │     │              │
│  Ingests     │     │  Generates   │     │  Curates &   │     │  Exports &   │
│  signals     │     │  leads from  │     │  drafts from │     │  publishes   │
│  from feeds  │     │  signals     │     │  leads       │     │  content     │
│              │     │              │     │              │     │              │
│  Trigger:    │     │  Trigger:    │     │  Trigger:    │     │  Trigger:    │
│  scheduled   │     │  auto after  │     │  HUMAN GATE  │     │  HUMAN GATE  │
│  or manual   │     │  research    │     │  (approval)  │     │  (publish)   │
└──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
```

### Agent Definition

Each agent is defined by:

```typescript
type AgentDefinition = {
  id: string;                          // e.g. "researcher"
  name: string;                        // e.g. "Researcher Agent"
  role: AgentRole;                     // maps to LLM config
  systemPrompt: string;                // persistent identity and instructions
  tools: AgentTool[];                  // functions the agent can invoke
  triggerMode: "scheduled" | "event" | "manual";
  humanGate: boolean;                  // if true, agent stops and waits for human approval before next stage
};

type AgentTool = {
  name: string;                        // e.g. "query_signals"
  description: string;                 // what the tool does (provided to LLM)
  execute: (params: unknown) => Promise<unknown>;
};

type AgentRunState = {
  agent_id: string;
  workspace_id: string;
  run_id: string;
  started_at: string;
  status: "running" | "completed" | "failed" | "awaiting_human";
  context: Record<string, unknown>;    // what the agent learned this run
  decisions: string[];                 // what it decided and why
  output_summary: string;             // human-readable result
};
```

### Agents

#### Researcher Agent
- **Role:** Ingest fresh signals from RSS feeds and manual sources
- **LLM role:** `research`
- **Trigger:** Scheduled (daily) or manual
- **Human gate:** No
- **Tools:**
  - `check_signal_freshness` — query signals table to determine staleness per directive
  - `ingest_directive` — run RSS ingest for a specific directive
  - `ingest_all` — run all directives (daily + weekly based on schedule)
  - `report_summary` — log what was ingested, what's new vs. skipped
- **Decision-making:** Checks which directives have stale signals (>24h for daily, >7d for weekly) and only runs those. Reports what it found.

#### Writer Agent
- **Role:** Generate editorial leads from fresh signals
- **LLM role:** `leads`
- **Trigger:** Event (fires after Researcher completes, if new signals were ingested)
- **Human gate:** No (leads are generated as `pending_review`)
- **Tools:**
  - `query_fresh_signals` — get signals from the last 14 days grouped by directive
  - `check_existing_leads` — check for duplicate angles before generating
  - `generate_leads` — call LLM to produce leads from signals
  - `save_leads` — persist leads to DB with proper deduplication
- **Decision-making:** Skips directives that already have sufficient pending leads. Adjusts lead count based on signal volume.

#### Editor Agent
- **Role:** Editor-in-Chief. Reviews approved leads, makes all editorial decisions, and produces the newsletter draft.
- **LLM role:** `editor`
- **Trigger:** Event (fires after Writer Agent completes in the pipeline)
- **Human gate:** No — the Editor runs autonomously. The human gate is *after* the Editor, when the user reviews the finished draft before publishing.
- **Tools:**
  - `get_approved_leads` — fetch approved leads with angles, confidence scores
  - `evaluate_material` — analyze lead quality, theme diversity, and whether premium Insider Access content is warranted
  - `select_steering` — choose aggression, audience, focus, tone based on lead themes (with reasoning)
  - `generate_newsletter_draft` — run the full generation pipeline (thesis → angle → draft → lint) with chosen parameters
  - `update_draft_status` — mark draft status (draft/reviewed/published)
- **Decision-making:**
  - Refuses to draft if fewer than 3 approved leads
  - Autonomously selects steering parameters based on lead content (e.g., breach stories → high aggression, governance → analytical)
  - Decides output mode: `full_issue` always; `bundle` (with Insider Access) only when leads contain genuinely premium practitioner-grade content worth paying for
  - Insider Access is a paid offering — the Editor only produces it when the material warrants it

#### Draft Status Lifecycle

```
draft → reviewed → published
```
- `draft` — generated by Editor Agent
- `reviewed` — human has reviewed (optional)
- `published` — exported/pushed, this is the one that went out

Tracked via `status` column on `issue_drafts`:
```sql
ALTER TABLE issue_drafts ADD COLUMN status TEXT NOT NULL DEFAULT 'draft'
  CHECK (status IN ('draft', 'reviewed', 'published'));
```

#### Publisher Agent
- **Role:** Export and distribute finished drafts
- **LLM role:** None (no LLM needed — deterministic rendering)
- **Trigger:** Manual (human clicks publish)
- **Human gate:** Yes — human must review draft before publishing
- **Tools:**
  - `render_html` — convert draft to newsletter-ready HTML
  - `push_beehiiv` — create Beehiiv draft (feature-flagged)
  - `render_linkedin` — format for LinkedIn posting (Phase 2)

### Orchestrator

The **Pipeline Orchestrator** coordinates agent handoffs:

```
POST /api/pipeline/run
```

Accepts:
- `stages`: which agents to run (default: all non-gated)
- `workspace_id`: scope
- `options`: per-agent overrides

Behavior:
1. Runs Researcher Agent — checks staleness, ingests stale directives
2. Runs Writer Agent — generates leads from fresh signals (skips if queue is full)
3. Runs Editor Agent — curates leads, selects steering, generates draft (refuses if <3 leads)
4. Human reviews the finished draft on the Issues page
5. Human triggers publish → runs Publisher Agent

The pipeline runs Researcher → Writer → Editor as a single autonomous sequence. The human gate is *after* the Editor, not before it.

Each agent run is logged to the `runs` table with its `AgentRunState`, enabling full audit trail and trend analysis.

### Run State Persistence

```sql
CREATE TABLE agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'failed', 'awaiting_human')),
  context JSONB DEFAULT '{}',
  decisions JSONB DEFAULT '[]',
  output_summary TEXT,
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  triggered_by TEXT                    -- 'schedule', 'event:researcher_completed', 'manual', etc.
);
```

---

## 3.2 LLM Abstraction Layer [NEW]

### Overview

All LLM calls route through a unified provider abstraction. Each agent role can use a different provider and model, configured via environment variables.

**Implemented:** `lib/llm/provider.ts`

### Providers Supported
- **Anthropic** (Claude) — default
- **OpenAI** (GPT-4o, GPT-4o-mini, etc.)

### Configuration

```
# Global default
LLM_PROVIDER=anthropic
LLM_MODEL=claude-sonnet-4-20250514

# Per-role overrides (format: provider:model)
LLM_RESEARCH=openai:gpt-4o-mini
LLM_LEADS=anthropic:claude-sonnet-4-20250514
LLM_EDITOR=anthropic:claude-sonnet-4-20250514
LLM_DRAFTING=openai:gpt-4o
LLM_REVISION=anthropic:claude-sonnet-4-20250514
LLM_LINT=openai:gpt-4o-mini
LLM_LINKEDIN=anthropic:claude-sonnet-4-20250514
```

### API

```typescript
callLLM(role: AgentRole, messages: LLMMessage[], opts?: LLMRequestOptions): Promise<LLMResponse>
getModelForRole(role: AgentRole): { provider: LLMProvider; model: string }
```

---

## 3.3 Research Engine
_Unchanged from v2.0. Will be wrapped by Researcher Agent._

---

## 3.4 Leads Pipeline [REVISED]
_Unchanged from v2.0. Will be wrapped by Writer Agent. Added field: `channel` on `editorial_leads`._

---

## 3.5 Angle + Draft Engine
_Unchanged from v2.0. Will be wrapped by Editor Agent._

---

## 3.6 Revision Engine
_Unchanged from v2.0._

---

## 3.7 Publishing Engine [REVISED]
_Unchanged from v2.0. Will be wrapped by Publisher Agent._

---

## 3.8 LinkedIn Draft Engine
_Unchanged from v2.0._

---

## 3.9 Creator Onboarding + LinkedIn Connection
_Unchanged from v2.0._

---

# 4. Brand Profile Schema
_Unchanged from v2.0._

---

# 5. Guardrails
_Unchanged from v2.0._

---

# 6. MVP Definition [REVISED]

Cornerstone OS must:

1. Support workspace-scoped multi-tenancy (existing)
2. Pull research via RSS directives — autonomously via Researcher Agent
3. Produce editorial-ready leads — autonomously via Writer Agent after research
4. Generate newsletter drafts from approved leads via Editor Agent with curation intelligence
5. Generate LinkedIn drafts from approved leads or newsletter sections
6. Apply per-creator voice guardrails to all generated content
7. Allow regeneration of individual sections — newsletter and LinkedIn
8. Persist structured drafts — `DraftObject` for newsletter, `LinkedInDraftObject` for LinkedIn
9. Support creator onboarding via API-connected flow
10. Export publish-ready content for both channels via Publisher Agent
11. **Operate Research → Leads as an autonomous pipeline with human gate at lead approval**
12. **Support pluggable LLM providers per agent role**

Stretch:
13. LinkedIn Marketing API analytics pull
14. Direct LinkedIn post publishing via API
15. Scheduled pipeline automation (Vercel cron → Pipeline Orchestrator)

---

# 7. Implementation Status [REVISED]

| Component | Status | Notes |
|-----------|--------|-------|
| Research Engine | Implemented | Unchanged from v1.1; ready for Researcher Agent wrapping |
| Leads pipeline | Implemented | Lifecycle: pending → approved → drafted → dismissed; 14-day window; dedup |
| Thesis + Angle + Draft | Implemented | Editor Agent curation, editorial angle with title uniqueness |
| Draft persistence | Implemented | `content_json` with `DraftObject` + runtime validation |
| Deterministic renderer | Implemented | `renderDraftMarkdown()` + `renderDraftHtml()` |
| Guardrails — system level | Implemented | Lint + auto-rewrite; em/en dash, forbidden phrases, editorial bias |
| Guardrails — creator level | Not started | Requires brand profile refactor |
| Guardrails — LinkedIn patterns | Not started | New |
| Revision Engine | Implemented | Section-level regen with lint retries |
| Publishing — HTML + Beehiiv | Implemented | HTML export always on; Beehiiv feature-flagged |
| Publishing — LinkedIn export | Not started | New |
| **LLM Abstraction Layer** | **Implemented** | Anthropic + OpenAI; per-role config via env vars |
| **Agent Framework** | **Not started** | Agent definitions, tool registry, orchestrator |
| **Researcher Agent** | **Not started** | First agent — wraps research engine |
| **Writer Agent** | **Not started** | Wraps leads pipeline |
| **Editor Agent** | **Implemented** | Autonomous editorial decisions: lead evaluation, steering selection, output mode, draft generation |
| **Draft status lifecycle** | **Implemented** | draft → reviewed → published tracking on `issue_drafts` |
| **Publisher Agent** | **Not started** | Wraps publish endpoints |
| **Pipeline Orchestrator** | **Not started** | `/api/pipeline/run` |
| **Agent run state** | **Not started** | `agent_runs` table |
| Brand profile — generic schema | Not started | Replaces hardcoded seed |
| Creator onboarding flow | Not started | New |
| LinkedIn OAuth connection | Not started | New |
| Post analysis + content type derivation | Not started | New |
| LinkedIn Draft Engine | Not started | New |
| LinkedIn Revision Engine | Not started | New |
| linkedin_drafts table | Not started | New |
| linkedin_connections table | Not started | New |
| Manual topic injection | Implemented | `/api/signals/create` + UI |
| Draft history | Implemented | `/api/issues/list` + UI with compare view |
| QoL — signals freshness | Implemented | Freshness indicator + stale warning |
| QoL — bulk lead actions | Implemented | Approve All / Dismiss All |
| QoL — draft comparison | Implemented | Side-by-side compare view |
| Test suite | Implemented | 171+ tests |
| UI | Implemented | Dark theme, sidebar nav, full feature access |

---

# 8. Roadmap [REVISED]

## Phase 1 — Agent Framework + Autonomous Pipeline
- Build agent abstraction (`lib/agents/framework.ts`): agent definition, tool registry, run loop
- Implement Researcher Agent with tools: `check_signal_freshness`, `ingest_directive`, `report_summary`
- Implement Writer Agent with tools: `query_fresh_signals`, `check_existing_leads`, `generate_leads`
- Build Pipeline Orchestrator (`/api/pipeline/run`)
- Add `agent_runs` table for run state persistence
- Research → Leads runs autonomously; human gate at lead approval
- UI: pipeline status dashboard showing agent run history

## Phase 2 — Brand Profile Refactor + LinkedIn Foundation
- Deprecate `POST /api/brand-profiles/seed`
- Implement generic `CreatorBrandProfile` schema
- Build creator onboarding flow (Steps 1–5)
- Implement LinkedIn OAuth connection
- Add `channel` field to `editorial_leads`
- Add `linkedin_connections` and `linkedin_drafts` tables
- Add LinkedIn-specific lint patterns
- Migrate existing workspace through onboarding flow

## Phase 3 — LinkedIn Draft Engine
- Build LinkedIn generate / regenerate / list / publish endpoints
- Add LinkedIn tab to Issues page
- Add channel selector to Leads approval UI
- LinkedIn draft management UI
- Expand test suite

## Phase 4 — Direct Publishing + Analytics
- LinkedIn post publishing via API
- LinkedIn Marketing API analytics pull
- Feedback loop: performance data updates benchmarks
- Scheduled pipeline automation (Vercel cron → Pipeline Orchestrator)

## Phase 5 — Multi-Brand + Platform Expansion
- Multi-brand orchestration
- Revenue alignment scoring
- Semi-autonomous issue drafting with confidence scoring
- Additional output channels (Twitter/X, Substack Notes)

---

# 9. Migration Notes
_Unchanged from v2.0._

---

End of Specification v2.1
