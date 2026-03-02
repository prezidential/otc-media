# Cornerstone OS
## System Specification v1.0

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

Output:
- **Signals** stored in Supabase (url, title, publisher, raw_text, directive_id, tags_json, dedupe_hash, etc.)
- **Sources** table for RSS feed metadata
- **Runs** table for ingest job tracking (e.g. `run_type: "directive_ingest"`)

Manual topic injection is not yet implemented.

---

## 3.2 Leads Pipeline (Editorial Leads)
Input:
- Recent signals (grouped by directive, bounded by date window)
- Brand profile (voice, formatting, forbidden patterns, etc.)

Output:
- **Editorial leads** in `editorial_leads` (angle, why_now, who_it_impacts, contrarian_take, confidence_score, status)
- Citations are enforced: each lead’s sources must be URLs from the selected signals; stored inline in contrarian_take as a "Sources:" block
- Status: `pending_review` → human approval → `approved`

Leads are generated via `/api/leads/generate`; approval via `/api/leads/approve`. No drafting occurs in this step.

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
- **Draft**: full newsletter issue (Title, Opening Hook, Fresh Signals, Deep Dive, From the Dojo, Promo Slot, Close) and/or Insider Access artifact, as **plain text**.

Output:
- **Plain-text draft(s)** (full issue and/or insider access when `bundle`).
- Optional persistence: latest full-issue draft stored in `issue_drafts` (single `content` column). Drafts are **not** stored as structured JSON; they are monolithic text.

Guardrails (no em/en dash, no forbidden phrases, etc.) are applied in system code; lint violations can trigger an auto-rewrite pass.

---

## 3.4 Revision Engine (Not Yet Implemented)
Planned input:
- draftId, section, instruction

Planned output:
- Regenerated section only; updated draft persisted.

Sections are not yet individually addressable in the API or storage model.

---

## 3.5 Publishing Engine (Phase 2)
Input:
- Approved draft

Output (planned):
- Beehiiv draft creation
- Metadata persisted

Not implemented in codebase.

---

# 4. MVP Definition

Cornerstone OS must:

1. Pull research (RSS via directives → signals)  
2. Produce editorial-ready inputs (leads from signals; approve flow)  
3. Generate draft(s) from approved leads (full issue and/or Insider Access, plain text)  
4. Allow regeneration of individual sections (Revision Engine — not yet built)  
5. Persist drafts (latest full-issue draft in `issue_drafts` as text)  

Stretch:
6. Push approved draft to Beehiiv as draft (Phase 2, not implemented)

---

# 5. Implementation Status (as of spec review)

| Component | Status | Notes |
|-----------|--------|--------|
| Research Engine | Implemented | RSS ingest (single + run-directives), signals/sources/runs in Supabase |
| Leads pipeline | Implemented | Generate, list, approve; citations bounded to signals |
| Thesis + Angle + Draft | Implemented | One thesis + one angle per run; draft is plain text; full_issue / insider_access / bundle |
| Draft persistence | Implemented | `issue_drafts.content` (text); no structured JSON draft schema |
| Guardrails | Implemented | Lint + auto-rewrite for em/en dash, forbidden phrases; replace map for compounds |
| Revision Engine | Not implemented | No section-level regenerate API |
| Publishing (Beehiiv) | Not implemented | Phase 2 |

---

# 6. Guardrails

The system must enforce:

- No em dashes  
- No lazy contrast structures  
- No forbidden thesis phrases  
- No filler or corporate jargon  
- Voice fidelity to David Lee style  

Guardrails must live in system code, not prompt memory. Current implementation: lint pass detects em dash, en dash, space-dash-space, and forbidden phrases; offending sentences are rewritten via a targeted LLM call. A deterministic replace map handles common compounds (e.g. "nation-state" → "nation state", "machine-speed" → "machine speed").

---

# 7. Long-Term Roadmap (Not MVP)

Phase 2:
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

End of Specification v1.0