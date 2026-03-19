# Cornerstone OS
## System Specification v1.1

Owner: OnTheCorner Media  
Module: Newsroom Engine  
Status: Active Development

---

# 1. Core Mission

Cornerstone OS exists to eliminate blank page friction and transform research into structured, voice-consistent, monetizable media assets.

It must:

- Ingest research
- Extract structured editorial angles
- Generate viewpoint-driven drafts
- Enforce writing constraints
- Support modular section regeneration
- Persist structured draft objects
- Prepare publish-ready drafts

It is infrastructure, not a chatbot.

---

# 2. Design Principles

1. Structured over freeform  
2. Modular over monolithic  
3. Deterministic over magical  
4. Persist state, do not recompute everything  
5. Human approval before publish  
6. Voice guardrails enforced at system level  
7. Replaceable LLM abstraction  

---

# 3. System Architecture

## 3.1 Research Engine
Input:
- RSS feeds (single-feed ingest or directive-driven batch)
- Research directives (name, cadence, mapped to feed URLs via `rssFeedMap`)
- Run-all endpoint for automated full ingest (daily + weekly in one call)

Output:
- **Signals** stored in Supabase (url, title, publisher, raw_text, directive_id, tags_json, dedupe_hash, etc.)
- **Sources** table for RSS feed metadata
- **Runs** table for ingest job tracking (e.g. `run_type: "directive_ingest"`)

Feed coverage spans 13+ cybersecurity and identity-focused sources across 8 research directives.

Manual topic injection is supported via `/api/signals/create` and the UI's "Manual Topic Injection" panel.

---

## 3.2 Leads Pipeline (Editorial Leads)
Input:
- Recent signals (grouped by directive, bounded by date window)
- Brand profile (voice, formatting, forbidden patterns, etc.)

Output:
- **Editorial leads** in `editorial_leads` (angle, why_now, who_it_impacts, contrarian_take, confidence_score, status)
- Citations are enforced: each lead's sources must be URLs from the selected signals; stored inline in contrarian_take as a "Sources:" block
- Status lifecycle: `pending_review` → human approval → `approved` → used in draft → `drafted`
- Deduplication: new leads are checked against existing pending/approved leads by angle similarity to prevent duplicate editorial angles

Leads are generated via `/api/leads/generate`; approval via `/api/leads/approve`. Leads used in a draft are automatically moved to `drafted` status with provenance tracked via `lead_ids_json` on the draft. The default signals window is 14 days (biweekly newsletter cadence).

---

## 3.3 Angle + Draft Engine (Issue Generation)
Input:
- Approved editorial leads
- Brand profile
- Editorial steering (aggressionLevel, audienceLevel, focusArea, toneMode)
- Output mode: `full_issue` | `insider_access` | `bundle`

Behavior:
- **Thesis engine**: generates 3 thesis candidates; one is selected (by weighted scoring or model choice) and injected into all drafting prompts.
- **Editorial angle**: one structured angle is generated from the approved leads (title, hook_line, hook_paragraphs, deep_dive_thesis, uncomfortable_truth, reframe, deep_dive_outline, dojo_checklist). This angle is **not** persisted as a separate entity; it is used in-memory to drive the draft.
- **Draft**: full newsletter issue (Title, Opening Hook, Fresh Signals, Deep Dive, From the Dojo, Promo Slot, Close) and/or Insider Access artifact.

Output:
- **Structured draft** persisted in `issue_drafts` with both `content` (rendered markdown) and `content_json` (structured `DraftObject`).
- `DraftObject` is the single source of truth for draft structure, validated at runtime before every insert/update.
- `renderDraftMarkdown()` deterministically renders `content_json` into markdown with a fixed section order.

Guardrails (no em/en dash, no forbidden phrases, etc.) are applied in system code; lint violations can trigger an auto-rewrite pass.

---

## 3.4 Revision Engine
Input:
- draftId, section (title | hook | deep_dive | dojo_checklist), instruction

Behavior:
- Regenerates only the targeted section; all other `content_json` keys are preserved.
- Lint guardrails enforced: up to 2 retries if lint fails; returns clear error on exhaustion.
- Internal editorial bias (IAM context, business consequence, explicit "so what") is injected via system prompt but never surfaced in API response.

Output:
- Updated `content` (re-rendered via `renderDraftMarkdown`) and `content_json` persisted to `issue_drafts`.

---

## 3.5 Publishing Engine
Input:
- Approved draft (draftId)

Output:
- **Capability status endpoint** — `/api/publish/status` returns `{ beehiiv, export_html }` so the UI can conditionally show publish controls.
- **HTML export** — `/api/publish/export-html` renders `content_json` into newsletter-ready inline-styled HTML via `renderDraftHtml()`. Also exposed by the "Export HTML" button on Issues page.
- **Beehiiv integration** — `/api/publish/beehiiv` creates a draft post in Beehiiv via their API. It is enabled only when `BEEHIIV_ENABLED=true` and both `BEEHIIV_API_KEY` and `BEEHIIV_PUBLICATION_ID` are present. When enabled, a "Push to Beehiiv" button appears on the Issues page.
- **Publish constraints** — publish endpoints require `draftId` and a saved `issue_drafts.content_json`; missing draft IDs return `400`, unknown IDs return `404`, and missing structured content returns `400`.

---

# 4. MVP Definition

Cornerstone OS must:

1. Pull research (RSS via directives → signals)  
2. Produce editorial-ready inputs (leads from signals; approve flow)  
3. Generate draft(s) from approved leads (full issue and/or Insider Access)  
4. Allow regeneration of individual sections (Revision Engine)  
5. Persist structured drafts (`DraftObject` in `content_json` + rendered markdown in `content`)  

Stretch:
6. Harden external publishing workflows (Beehiiv error handling, rollout policy, observability)

---

# 5. Implementation Status

| Component | Status | Notes |
|-----------|--------|--------|
| Research Engine | Implemented | RSS ingest (single + run-directives + run-all), 13+ feeds across 8 directives |
| Leads pipeline | Implemented | Generate, list, approve, draft lifecycle; deduplication; 14-day signal window |
| Thesis + Angle + Draft | Implemented | One thesis + one angle per run; full_issue / insider_access / bundle |
| Draft persistence | Implemented | `issue_drafts.content` (rendered markdown) + `content_json` (`DraftObject` with runtime validation) |
| Deterministic renderer | Implemented | `renderDraftMarkdown()` enforces fixed section order |
| Guardrails | Implemented | Lint + auto-rewrite for em/en dash, forbidden phrases; replace map for compounds; editorial bias in regen prompts |
| Revision Engine | Implemented | Section-level regenerate API with lint retries and guardrails |
| Manual topic injection | Implemented | `/api/signals/create` + UI panel for adding signals without RSS |
| Draft history | Implemented | `/api/issues/list` + UI history panel for loading previous drafts |
| Test suite | Implemented | 143+ Vitest tests covering lib modules and API routes |
| UI | Implemented | Dark theme, sidebar nav, section regen controls, draft history, approved leads tab, manual injection |
| Publishing | Implemented | HTML export (always available) + Beehiiv API (feature-flagged with env-based capability checks) |

---

# 6. Guardrails

The system must enforce:

- No em dashes  
- No lazy contrast structures  
- No forbidden thesis phrases  
- No filler or corporate jargon  
- Voice fidelity to David Lee style  

Guardrails must live in system code, not prompt memory. Current implementation: lint pass detects em dash, en dash, space-dash-space, and forbidden phrases; offending sentences are rewritten via a targeted LLM call. A deterministic replace map handles common compounds (e.g. "nation-state" → "nation state", "machine-speed" → "machine speed").

The regenerate endpoint additionally enforces editorial bias via internal prompt directives (IAM specificity, business consequence, explicit "so what"), which are never exposed in API responses.

---

# 7. Long-Term Roadmap (Not MVP)

Phase 2:
- Beehiiv production hardening (scheduling/automation, richer telemetry, rollback-safe workflows)
- Social snippet generator
- Podcast outline mode
- Sponsorship alignment logic

Phase 3:
- Multi-brand orchestration
- Revenue alignment scoring
- Feedback loop analytics

Phase 4:
- Semi-autonomous issue drafting
- Confidence scoring

---

End of Specification v1.1
