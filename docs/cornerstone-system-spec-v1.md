# Cornerstone OS
## System Specification v1.2

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

**Extension (designed, not yet built):** A **Research & Creation Studio** adds a conversational workspace for ideation and stance formation. That workspace still terminates in **structured artifacts** (a captured brief and downstream drafts), not in ad hoc chat as the system of record. See §3.6.

---

# 2. Design Principles

1. Structured over freeform  
2. Modular over monolithic  
3. Deterministic over magical  
4. Persist state, do not recompute everything  
5. Human approval before publish  
6. Voice guardrails enforced at system level  
7. Replaceable LLM abstraction  
8. Conversational exploration must **crystallize** into structured inputs before publish-facing generation (no “chat-only” drafts)

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
- **Beehiiv integration** — `/api/publish/beehiiv` creates a draft post in Beehiiv via their API when `BEEHIIV_ENABLED=true` and keys/publication ID are present. Many accounts need enterprise access for API content creation; when disabled or misconfigured, the UI hides or surfaces errors from this route.
- **Publish constraints** — publish endpoints require `draftId` and a saved `issue_drafts.content_json`; missing draft IDs return `400`, unknown IDs return `404`, and missing structured content returns `400`.

**Phase 2 content products:**
- `POST /api/content-products/social-snippets` — `{ draftId }` or `{ content_json }` → X / LinkedIn / Threads text
- `POST /api/content-products/podcast-outline` — same inputs → JSON outline (segments + beats)
- `POST /api/content-products/sponsorship-alignment` — `{ draftId }` or `{ content_json }` + active `revenue_items` → recommended offer + suggested mention

**Operations:**
- `GET /api/health` — env readiness (`supabase`, `workspace_id`, optional `anthropic_api_key` check) without exposing secrets
- Structured `opsLog` events for draft persistence failures (`issue_drafts.insert_failed`, `insert_threw`)

---

## 3.6 Research & Creation Studio (planned)

This subsection specifies a **future** capability: a Claude-style **research and brainstorming** surface where the user and a model discuss a topic, challenge assumptions, and converge on a **stance**. From that conversation, the user can request **brand-aligned content** (blog posts, LinkedIn posts, infographics, etc.). Generation after the handoff uses dedicated **Writer** and **Editor** agent roles so voice, lint, and brand profile rules match the rest of Cornerstone OS.

### 3.6.1 Purpose and boundaries

| Layer | Role |
|--------|------|
| **Conversation (Research) workspace** | Open-ended dialogue: explore, debate, summarize sources, stress-test arguments. Outputs are **provisional** until the user explicitly **captures** a brief. |
| **Production pipeline** | Takes a **structured Creative Brief** (+ brand profile + optional steering). Produces drafts and derivative assets. Subject to the same guardrails as RSS-driven and lead-driven flows. |

The product is **not** “another chatbot that writes the newsletter.” Chat is the **front room**; the **back room** remains structured drafts, validation, and human approval before publish.

### 3.6.2 Agent roles (conceptual)

These are **logical roles** (may map to one or more prompts, tools, or services in implementation). They align with the existing system: brand profile, lint, `DraftObject` / markdown rendering, and Phase 2 **content products** where applicable.

1. **Research agent (conversation)**  
   - Facilitates exploration, asks clarifying questions, plays devil’s advocate when useful.  
   - May suggest citations or factual checks; does **not** bypass citation rules when those apply to downstream artifacts.  
   - **Does not** emit publish-ready copy as the sole source of truth; it nudges the user toward **capturing** a brief when they are ready to “lock” stance and intent.

2. **Writer agent**  
   - **Input:** Creative Brief (structured), brand profile, output template (e.g. long-form blog, LinkedIn post, newsletter section), and optional editorial steering (aggression level, audience, tone mode—same family as §3.3).  
   - **Output:** First-pass **content** in the shape required for the target product (markdown body, social snippet set, outline for audio, etc.).  
   - Uses the same voice and structural expectations as the Angle + Draft Engine, adapted per format.

3. **Editor agent**  
   - **Input:** Writer output + brand profile + system guardrails (§6).  
   - **Behavior:** Enforces voice fidelity, forbidden patterns, formatting rules, and structural completeness for the chosen format; may request or perform **targeted rewrites** (analogous to §3.4 section-level revision, but scoped to the new artifact types).  
   - **Output:** Lint-clean, brand-consistent draft ready for human review or export—same approval posture as existing issues.

**Orchestration rule:** For any user-facing “create content from this chat,” the path is **Research → (user confirms) Creative Brief → Writer → Editor → persisted draft / product**. Skipping the Editor role for publish-bound text is **out of spec** for v1 of this feature.

### 3.6.3 Creative Brief (handoff contract)

When the user decides the conversation has produced a usable stance, the system **materializes** a **Creative Brief**—a structured object (not raw chat logs) that downstream agents consume. Minimum conceptual fields:

- **Topic title** — short label for the session artifact.  
- **Thesis / stance** — one clear position the content will argue or explain.  
- **Audience** — who must understand this (maps to existing audience level / tone controls).  
- **Key claims** — bullet list of points to land (order may inform outline).  
- **Counterarguments addressed** — optional; improves depth and credibility.  
- **Tone and risk posture** — e.g. how sharp, how much naming of vendors, alignment with `toneMode` / aggression where defined.  
- **Target outputs** — one or more of: blog (long), LinkedIn, X/Threads, newsletter section, infographic **brief** (see below), podcast outline, etc.  
- **Constraints** — must-include / must-avoid, length bounds, disclosure or compliance notes if any.  
- **Provenance** — link to conversation session id and message range or “summary checkpoint” version; optional user-editable overrides before generation.

The user may **edit the brief** before invoking Writer; chat history remains available for reference but the **brief is the contract** for generation.

### 3.6.4 User journey (example)

1. User opens a **Research session** on “new cybersecurity architecture” (or any topic, including non-RSS themes).  
2. User and Research agent discuss tradeoffs, debate, and converge on a stance.  
3. User clicks **Capture brief** (or equivalent); the system proposes a Creative Brief from the thread; user adjusts thesis and outputs.  
4. User selects **Create: LinkedIn post** (and/or other formats).  
5. **Writer** generates the first pass; **Editor** applies brand profile + lint + structural fixes.  
6. User reviews in the same **approval** pattern as issues; exports or routes to publishing / content products as today.

### 3.6.5 Mapping to existing engines

| Studio output | Primary reuse |
|---------------|----------------|
| Long-form thought leadership / blog-shaped markdown | New template or reuse of `DraftObject`-like sections where fit; same render/lint path where applicable. |
| LinkedIn / social text | Align with `POST /api/content-products/social-snippets` patterns; input may be `{ creativeBrief }` or a **studio draft id** that resolves to structured content. |
| Newsletter issue slice | Optional promotion into **leads** or a **partial issue** workflow, or direct draft section generation from brief—implementation choice, but must persist structured state. |
| Infographic | **Not** plain LLM text: spec assumes a **structured infographic brief** (headline, key stats, section titles, visual metaphors) plus a **design/export** step (human tool, template, or future asset pipeline). Writer/Editor still own **copy**; visual production may be Phase B. |
| Podcast outline | Reuse `content-products/podcast-outline` input shape extended to accept Creative Brief. |

**Relationship to RSS-led Research Engine (§3.1):** Signals and directives remain the **automated** research spine. The Studio adds **user-initiated** research threads that can **complement** signals (e.g. user pastes URLs or asks for synthesis) or stand alone. Optionally, a future integration could **attach** selected signals to a session as context; the brief would still be the handoff artifact.

**Relationship to Leads (§3.2):** A Creative Brief could **spawn** a proposed editorial lead for the newsletter pipeline, or bypass leads when the user only wants a standalone LinkedIn post. Product policy can define defaults; the spec only requires **clear provenance** (which pipeline produced which artifact).

### 3.6.6 Persistence and UX (conceptual)

- **Session:** id, title, created/updated timestamps, optional links to workspace/user.  
- **Messages:** ordered turns with role (`user` | `assistant` | optional `system`); storage for replay and audit.  
- **Creative Brief:** versioned rows or immutable snapshots once generation is requested (so reruns are reproducible).  
- **Generated artifacts:** references to `issue_drafts` rows and/or content-product outputs, with `source_session_id` / `brief_version_id` for traceability.

UI pattern: **conversation panel** (Claude-like: single thread, clear separation of “discussion” vs. “deliverables”) plus a **Brief** side panel or modal for editing the structured handoff before “Create content.”

### 3.6.7 Non-goals (initial delivery)

- Replacing the **Leads** or **RSS** pipeline as the only path to a newsletter issue.  
- Fully automated infographic design without a defined asset pipeline or human sign-off.  
- Publishing without a human approval step (same as §1 / §4).  
- Letting the Research agent alone produce publish-bound copy **without** Writer + Editor and persistence.

### 3.6.8 Phasing suggestion

| Phase | Scope |
|--------|--------|
| **A** | Sessions + messages + Creative Brief capture/edit + Writer → Editor → persist markdown (one format, e.g. blog or long post). |
| **B** | Multiple formats; hook social snippets and podcast outline from brief; optional “promote to lead.” |
| **C** | Signal attachment to sessions; infographic copy brief + export handoff to design tools. |

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
| Publishing | Implemented | HTML export + Beehiiv API (env-gated); enterprise limits may block real use |
| Phase 2 content products | Implemented | social-snippets, podcast-outline, sponsorship-alignment |
| Research & Creation Studio | Not implemented | Designed in §3.6: chat workspace → Creative Brief → Writer + Editor → drafts / content products |
| Health / ops logging | Implemented | `/api/health`, `opsLog` on draft insert failures |

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
- **Research & Creation Studio** (§3.6): conversational research workspace, Creative Brief handoff, Writer + Editor orchestration, multi-format outputs aligned with brand profile
- Multi-brand orchestration
- Revenue alignment scoring
- Feedback loop analytics

Phase 4:
- Semi-autonomous issue drafting
- Confidence scoring

---

End of Specification v1.2
