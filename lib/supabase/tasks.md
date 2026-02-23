# OTC Media Engine Build Tasks (Phase 1)

## Ground Rules
- Do not invent DB fields or tables.
- Use WORKSPACE_ID from env on all queries/inserts.
- Server uses SUPABASE_SECRET_KEY.
- Browser uses NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.
- Prefer small, reviewable diffs.
- Keep logic in API routes (V1). No background jobs yet.

---

## Task 1 — Supabase Clients
Create:
- lib/supabase/server.ts
- lib/supabase/browser.ts

Requirements:
- server.ts uses createClient(url, SUPABASE_SECRET_KEY)
- browser.ts uses createClient(url, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
- No extra logic

---

## Task 2 — RSS Ingestion Route
Create:
- app/api/ingest/rss/route.ts

Requirements:
- Input JSON: { feedUrl, sourceName?, limit? }
- Parse RSS feed
- Upsert sources row (type='rss', base_url=feedUrl)
- Insert signals rows (workspace_id, source_id, url, title, publisher, published_at, raw_text, normalized_summary, trust_score, dedupe_hash)
- Deduplicate by URL (signals.url is unique)
- Return { inserted, skipped, publisher }

---

## Task 3 — Signals List API
Create:
- app/api/signals/list/route.ts

Requirements:
- Query signals by workspace_id
- Sort by captured_at desc
- Support query param: limit (default 25)
- Return { signals: [...] } with fields:
  title, publisher, url, published_at, captured_at, tags_json, directive_id

---

## Task 4 — Research Directives Seed Route
Create:
- app/api/research/seed-directives/route.ts

Requirements:
- Inserts default directives if none exist for workspace
- If already exists, do nothing
- Default directives should include at least:
  - Identity Vendor Moves (daily)
  - Non-Human Identity Incidents (daily)
  - Identity + AI (daily)
  - Regulatory and Standards (weekly)
  - IGA Modernization and Migration (weekly)
- Return inserted count

---

## Task 5 — Directive Runner (RSS-backed)
Create:
- lib/research/rssFeedMap.ts
- app/api/research/run-directives/route.ts

Requirements:
- rssFeedMap.ts maps directive name -> array of RSS feed URLs
- run-directives:
  - Input JSON: { cadence: 'daily'|'weekly', limitPerFeed? }
  - Load active directives for cadence
  - For each directive, ingest mapped RSS feeds
  - Upsert sources and insert signals
  - Set signals.directive_id = directive.id
  - Set tags_json includes directive name
  - Insert run log into runs table:
    - initiated at start
    - completed with output_refs_json { inserted, skipped, details }
    - failed with error_message on error
- Return summary JSON

---

## Task 6 — Research Console Page
Create:
- app/research/page.tsx
- app/api/research/list-directives/route.ts
- app/api/runs/list/route.ts

Requirements:
- research page shows:
  - button: “Run Daily Directives”
  - list of directives
  - list of recent runs
- APIs:
  - list-directives returns directives for workspace
  - runs/list returns recent runs for workspace, supports limit query param

  ---

## Task 7 — Lead Generator V0 (Hybrid, citation-bounded)
Create:
- app/api/leads/generate/route.ts
- app/api/leads/list/route.ts
- app/api/leads/approve/route.ts
- app/leads/page.tsx

Requirements:
- Deterministic selection:
  - Pull recent signals for workspace from last 7 days
  - Group by directive_id
  - Take up to 12 signals per directive
- Hybrid generation:
  - Use an LLM ONLY to propose 2-4 leads per directive
  - The LLM input must include the selected signal titles + URLs
  - The LLM output must include citations: a list of URLs used for each lead
  - If a lead has no citations, discard it
  -	Claude must return JSON only that matches the Zod schema in lib/leads/leadSchema.ts.

- Insert into editorial_leads:
  - workspace_id
  - cluster_id = null
  - brand_profile_id = null (V0)
  - angle (string)
  - why_now (string)
  - who_it_impacts (string)
  - contrarian_take (string)
  - confidence_score (0-1)
  - status = 'pending_review'
- Also insert a run log into runs:
  - run_type = 'lead_generation'
  - initiated → completed with output_refs_json counts
- Leads list API returns leads ordered by created_at desc
- Approve API sets status to 'approved'
- Leads page:
  - Button: Generate Leads
  - List pending leads with Approve button
  - Display citations (URLs) per lead (store in a JSON field? NO. Use contrarian_take or why_now to include "Sources:" block until we add a citations column for leads.)
Constraints:
- Do not change schema in this task.
- Do not invent DB columns.


## Patch — Approve API Contract
Update:
- app/api/leads/approve/route.ts

Requirements:
- Accept JSON body { leadId: string }
- Backwards compatible: also accept { id: string } for now
- Prefer leadId if both are provided
- Error message must be "leadId required" when missing both
- Response stays: { ok: true, lead: { id, status } }

## Patch — Lead citations enforcement (V0)
Update:
- app/api/leads/generate/route.ts

Requirements:
- For each directive, create allowedUrls set from selected signals
- After Claude output parsed via Zod, validate:
  - each lead.sources exists and length >= 1
  - every source URL is in allowedUrls
- Discard any lead that fails validation
- When inserting editorial_leads, append sources into contrarian_take as:

<contrarian_take>

Sources:
- url1
- url2

- If after filtering a directive has 0 valid leads, do not insert any for that directive; include directive in response with generated=0 and reason.
- Do not change schema.

## Task 7.5 — Brand Profiles V1 (SaaS proof tuning layer)
Create:
- app/api/brand-profiles/seed/route.ts
- app/api/brand-profiles/list/route.ts

Update:
- app/api/leads/generate/route.ts
- app/leads/page.tsx

Requirements:
- Seed route inserts 1 default Brand Profile for Identity Jedi if none exist
- List route returns brand profiles for workspace ordered by created_at asc
- Lead generation must accept JSON body:
  { days?: number, brandProfileId: string }
- Generator loads brand profile by id and workspace_id from brand_profiles
- Generator injects brand profile rules into Claude system prompt
- Generator inserts editorial_leads.brand_profile_id = brandProfileId
- Leads page:
  - fetch brand profiles
  - dropdown to select brand profile
  - Generate Leads uses selected brandProfileId
Constraints:
- Do not change schema
- Do not invent new columns
- Keep prompt as data driven from brand_profiles JSON fields


## Patch — Lead generation uses Brand Profile
Update:
- app/api/leads/generate/route.ts
- app/leads/page.tsx

Requirements:
- leads/generate must require JSON body: { days?: number, brandProfileId: string }
- Load brand profile by id + workspace_id from brand_profiles
- Insert editorial_leads.brand_profile_id = brandProfileId for each lead
- Claude prompt must be data-driven using the brand profile JSON fields:
  voice_rules_json, formatting_rules_json, forbidden_patterns_json,
  cta_rules_json, emoji_policy_json, narrative_preferences_json
- Claude must output JSON only, validated by existing Zod schema
- Keep citations enforcement exactly as-is
- Leads page:
  - fetch /api/brand-profiles/list
  - dropdown to select a brand profile (default first)
  - Generate Leads passes selected brandProfileId
Constraints:
- Do not change schema
- Do not invent new DB fields
#################

## Task 8 — Revenue Slot Suggestion V0 (Brand tuned)
Create:
- app/api/revenue/seed/route.ts
- app/api/revenue/list/route.ts
- app/api/revenue/recommend/route.ts

Update:
- app/leads/page.tsx (optional: show recommended promo block)

Requirements:
- revenue/seed:
  - if no revenue_items exist for workspace, insert 2 default items:
    1) "Identity Jedi Newsletter Premium" (type: subscription)
    2) "Workshop-in-a-Box" (type: digital_product)
  - mark them active
- revenue/list:
  - list active revenue_items for workspace ordered by created_at asc
- revenue/recommend:
  - input JSON: { brandProfileId: string }
  - deterministic selection: choose 1 active revenue_item (first by priority if exists, else newest)
  - generate a short promo block (3-6 lines) using Claude, tuned by brand profile JSON
  - must include a single CTA line
  - must avoid forbidden patterns and avoid dashes in sentences
  - return { ok, item, promoText }
Constraints:
- Do not change schema
- Do not invent new columns

## Patch — Revenue recommend voice tightening
Update:
- app/api/revenue/recommend/route.ts

Requirements:
- Enforce promoText format: 3-5 lines, 1 sentence per line
- Explicitly prohibit "This isn't" and "This is not" phrasing
- Prohibit buzzwords: actionable, industry insiders, stay ahead, evolving faster
- Keep brand-profile-driven tuning intact
- Return plain text only
Constraints:
- Do not change schema

## Task 9 — Issue Draft Assembler V0 (IDJ format)
Create:
- app/api/issues/generate/route.ts
- app/api/issues/latest/route.ts
- app/issues/page.tsx

Requirements:
- issues/generate input JSON:
  { brandProfileId: string, cadence?: 'daily'|'weekly', leadLimit?: number }
- Fetch:
  - brand profile by id + workspace_id
  - approved leads (status='approved') newest first, limit leadLimit (default 6)
  - promo slot from /api/revenue/recommend using same brandProfileId (internal call or shared function)
- Use Claude to assemble a single newsletter draft in IDJ format.
- Output must be plain text (no markdown headings required, but can be used).
- Must include these sections, in this order:
  1) Title (one line)
  2) Opening Hook (2-3 short paragraphs)
  3) Fresh Signals (3-6 items, each item: title + 2-3 sentence take + Sources list)
  4) Deep Dive (600-900 words, editorial, in IDJ voice)
  5) From the Dojo (practical checklist: 5 bullets)
  6) Promo Slot (use promoText verbatim)
  7) Close (short sign-off + CTA: Subscribe)
- Each Fresh Signals item must include citations using URLs from the lead Sources blocks.
- Store generated draft in table issue_drafts if it exists; if it does not exist, return draft only and do not fail.
- issues/latest returns last generated draft (if stored) else error message.
- issues page:
  - dropdown brand profile
  - button Generate Issue Draft
  - output preview with copy button
Constraints:
- Do not change schema
- Do not invent new tables
- If issue_drafts table does not exist, gracefully skip persistence.


## Patch — Issue draft voice tightening
Update:
- app/api/issues/generate/route.ts

Requirements:
- Strengthen Claude instructions:
  - No dashes inside sentences (no '-', '—', '–')
  - Avoid phrases: "This isn't", "isn't just", "The real problem isn't"
  - Vary sentence starters, avoid repeated "The problem is" patterns
  - Keep paragraphs to 1-2 sentences
- Fresh Signals format:
  - Sources must be formatted as:
    Sources:
    - url
    - url
- Do not invent sources
- Keep promoText verbatim
Constraints:
- Do not change schema


## Task 10 — Editorial Steering Controls (Issue Generator)
Goal: Add controllable editorial steering inputs to /api/issues/generate so the newsletter posture can be changed without editing prompts.

Update:
- app/api/issues/generate/route.ts

API changes:
- POST body should accept optional fields:
  - aggressionLevel: number (1–5, default 3)
  - audienceLevel: "practitioner" | "ciso" | "board" (default "practitioner")
  - focusArea: "strategic" | "tactical" | "architecture" (default "architecture")
  - toneMode: "reflective" | "confrontational" | "analytical" | "strategic" (default "strategic")

Prompt changes:
- Inject steering values into the user prompt near the top under an "Editorial Steering Inputs" label.
- Add explicit behavior mapping inside the system prompt:
  - aggression guidance (1–2 measured, 3 confident, 4–5 sharp)
  - audience guidance (practitioner vs ciso vs board)
  - focus guidance (strategic vs tactical vs architecture)
  - toneMode guidance (reflective vs confrontational vs analytical vs strategic)
- Ensure these steering inputs influence:
  - Opening Hook posture
  - Deep Dive posture
  - From the Dojo level of specificity

Constraints:
- Do not change database schema.
- Do not create new tables.
- Keep current IDJ issue section order unchanged.
- Keep sources non-hallucination guarantees intact.
- Keep promo slot verbatim.

## Task 11 — Issues UI: Editorial Steering Controls
Goal: Add editorial steering controls to the /issues page so issue generation can be directed without curl.

Update:
- app/issues/page.tsx

UI requirements:
- Keep existing brand profile dropdown.
- Add controls:
  1) aggressionLevel slider (1–5), default 3
     - Show current value label (e.g., "Aggression: 3")
  2) audienceLevel dropdown: practitioner | ciso | board (default practitioner)
  3) focusArea dropdown: strategic | tactical | architecture (default architecture)
  4) toneMode dropdown: reflective | confrontational | analytical | strategic (default strategic)

Behavior:
- When "Generate Issue Draft" is clicked, call POST /api/issues/generate with JSON body:
  {
    brandProfileId,
    leadLimit,
    aggressionLevel,
    audienceLevel,
    focusArea,
    toneMode
  }
- Keep leadLimit input if it exists; if not, add a simple numeric input default 6.
- Show loading state while generating.
- Render the returned draft in a scrollable preview.
- Add a "Copy Draft" button that copies the draft text to clipboard.
- Display API errors in the UI with a readable message.

Constraints:
- Do not change DB schema.
- Do not add new API routes.
- Use existing styling patterns already in the app.

## Task 12 — Issues UI: Editorial Steering Presets
Goal: Add one-click preset buttons to /issues that set editorial steering controls (and optionally leadLimit) to common profiles.

Update:
- app/issues/page.tsx

Presets (hardcoded for now):
1) "CISO Aggressive"
   - aggressionLevel: 5
   - audienceLevel: "ciso"
   - focusArea: "strategic"
   - toneMode: "confrontational"
   - leadLimit: 6

2) "Board Brief"
   - aggressionLevel: 4
   - audienceLevel: "board"
   - focusArea: "strategic"
   - toneMode: "strategic"
   - leadLimit: 4

3) "Practitioner Tactical"
   - aggressionLevel: 3
   - audienceLevel: "practitioner"
   - focusArea: "tactical"
   - toneMode: "analytical"
   - leadLimit: 6

4) "Reflective Operator"
   - aggressionLevel: 3
   - audienceLevel: "practitioner"
   - focusArea: "architecture"
   - toneMode: "reflective"
   - leadLimit: 6

UI requirements:
- Add a small "Presets" section near the steering controls.
- Each preset is a button.
- Clicking a preset updates the UI state (slider + dropdowns + leadLimit) immediately.
- Do not auto-generate on click; user still clicks "Generate Issue Draft".
- Visually indicate the currently selected preset (optional but preferred):
  - highlight active preset button
  - or show a "Selected preset: X" label

Constraints:
- Do not change DB schema.
- Do not add new API routes.
- Keep existing Generate + Copy behavior unchanged.

## Task 13 — IDJ Insider Access Module (Premium Desk)
Goal: Create a separate Insider Access artifact generated from approved leads.

Update:
- app/api/issues/generate/route.ts

API changes:
- Accept optional field:
  - outputMode: "full_issue" | "insider_access"
- Default to "full_issue"

If outputMode === "insider_access":
- Generate ONLY the Insider Access artifact.
- Do NOT generate Fresh Signals, Hook, Promo, or Close.
- Return { ok: true, draft: insiderAccessText }

Insider Access structure:

1) Title (max 8 words, no punctuation)
2) What Most Teams Miss (2–4 paragraphs)
3) What I Would Actually Change (2–4 paragraphs)
4) Vendor Reality Check (direct, opinionated, no brand bashing)
5) Tactical Architecture Shift (3–5 bullets)

Rules:
- No hook.
- No invitation lines.
- No promo.
- No recap tone.
- Assume audience is experienced IAM practitioner.
- Go deeper than public editorial.
- Reference at most 2 signals by name.
- No dashes inside sentences.
- Maintain Identity Jedi posture but more surgical and less rhetorical.

## Task 14 — Issues UI: Output Mode Toggle (Full vs Insider vs Both)
Goal: In /issues UI, allow generating:
- Full Issue only
- Insider Access only
- Both (bundle)

Update:
- app/issues/page.tsx

UI requirements:
- Add an "Output Mode" control near steering controls.
- Modes:
  1) "Full Issue" -> outputMode: "full_issue"
  2) "Insider Access" -> outputMode: "insider_access"
  3) "Both" -> outputMode: "bundle"
- Default: "full_issue"

Behavior:
- Include outputMode in POST /api/issues/generate body.
- If response contains:
  - draft: render in the main preview
  - insiderDraft: render in a second preview pane/section titled "Insider Access"
- Add separate copy buttons:
  - "Copy Draft" copies draft
  - "Copy Insider" copies insiderDraft (only visible if present)

Constraints:
- No new pages.
- Do not break existing generate/copy behavior for full_issue.

## Task 15 — API: Bundle Mode (Full Issue + Insider Access in One Call)
Goal: Add outputMode "bundle" to /api/issues/generate so the API can generate:
- the full public issue draft
- AND the Insider Access draft
using the same approved leads and brand profile.

Update:
- app/api/issues/generate/route.ts

API changes:
- Accept outputMode: "full_issue" | "insider_access" | "bundle"
- Default: "full_issue"

Behavior:
- full_issue: existing behavior unchanged (returns { ok, draft })
- insider_access: existing behavior unchanged (returns { ok, draft })
- bundle:
  - Generate full issue draft using existing full_issue prompt
  - Generate insider access draft using existing insider_access prompt
  - Return:
    {
      ok: true,
      draft: <full issue>,
      insiderDraft: <insider access>,
      stored: <existing stored behavior for full issue only>
    }

Rules:
- Use the SAME set of approved leads for both drafts (same leadLimit query result).
- Do not re-query leads separately for insider generation.
- Keep source restrictions intact.
- Keep promo slot verbatim (applies to full issue only).
- Insider draft must NOT include promo/hook/fresh signals/close.

Constraints:
- No DB schema changes.
- No new API routes.
- Keep the existing revenue recommend logic for full_issue only.
- Keep existing "stored" behavior for the full issue only (do not store insider unless it already exists in code).


## Task 16 — Editorial Thesis Engine (v1)
Goal: Reduce repetition and force stronger editorial posture by generating a primary thesis before drafting. The selected thesis must steer both full_issue and insider_access outputs (and bundle).

Update:
- app/api/issues/generate/route.ts

Behavior:
1) After approved leads are fetched and leadsBlock is built, generate 3 thesis candidates via Claude.
2) Claude must return STRICT JSON (no markdown) containing:
   - theses: [{ id, thesis, scores: { distinctiveness, tension, operator_usefulness, mode_fit }, total }]
   - selected_id
3) Select thesis in code:
   - use selected_id from Claude response
   - fallback: choose max total
   - fallback 2: first thesis
4) Inject the selected thesis into the drafting prompt(s) for:
   - full_issue
   - insider_access
   - bundle (applies to both drafts)

Thesis requirements:
- Exactly 1 sentence each.
- Strong position, arguable, not recap.
- No URLs.
- Avoid generic phrases: "this week", "signals", "the industry", "in todays world".
- Avoid: "The real issue is", "The real risk is", "The real problem is".
- No dashes inside sentences.

Exact thesis generation prompt (use verbatim):

SYSTEM (thesis):
You are the Identity Jedi editorial strategy desk. Output strict JSON only. No markdown. No commentary.

USER (thesis):
Generate three distinct one sentence editorial theses based on the approved leads.

Constraints:
- Each thesis must be exactly one sentence.
- Each thesis must take a strong position someone could disagree with.
- Do not summarize the leads or list events.
- Do not include URLs.
- Avoid generic phrases: "this week", "signals", "the industry", "in todays world", "the real issue is", "the real risk is", "the real problem is".
- No dashes inside sentences.

Scoring rubric:
- distinctiveness: 1 to 5
- tension: 1 to 5
- operator_usefulness: 1 to 5
- mode_fit: 1 to 5, mode is "${outputMode}"

Return strict JSON in this shape:
{
  "theses": [
    { "id": "t1", "thesis": "...", "scores": { "distinctiveness": 1, "tension": 1, "operator_usefulness": 1, "mode_fit": 1 }, "total": 4 },
    { "id": "t2", "thesis": "...", "scores": { "distinctiveness": 1, "tension": 1, "operator_usefulness": 1, "mode_fit": 1 }, "total": 4 },
    { "id": "t3", "thesis": "...", "scores": { "distinctiveness": 1, "tension": 1, "operator_usefulness": 1, "mode_fit": 1 }, "total": 4 }
  ],
  "selected_id": "t2"
}

Approved leads:
${leadsBlock}

Draft prompt injection:
- Add this block near the top of the drafting userPrompt(s), above section instructions:

Primary Thesis:
${selectedThesis}

Every section must reinforce this thesis. Avoid recap.

Response:
- Include selectedThesis in the API response JSON for debugging.
- Optionally include theses array as well.

Constraints:
- No new DB schema.
- No new API routes.
- Keep source restrictions intact.
- Keep promo slot verbatim rules unchanged.
- Do not change existing full_issue/insider_access output format beyond adding thesis influence.


## Task 16.1 — Thesis Engine Guardrails (Validation + Fallback)
Goal: Make thesis generation reliable and prevent bad JSON or weak theses from breaking drafting.

Update:
- app/api/issues/generate/route.ts

Validation:
After parsing thesis JSON, validate:
1) theses exists and is an array of length exactly 3
2) each thesis.thesis is a non-empty string
3) each thesis is exactly one sentence (simple heuristic):
   - count sentence terminators [. ! ?] <= 1
   - AND does not contain "\n"
4) no thesis contains "http://" or "https://"
5) no thesis contains forbidden patterns:
   - "the real issue is"
   - "the real risk is"
   - "the real problem is"

Selection guardrails:
- If selected_id not found, pick highest total.
- If totals missing, compute total = sum(scores values).

Fallback:
If any validation fails OR Claude call errors OR JSON parse fails:
- Set selectedThesis to this exact fallback string:
  Identity programs are misclassified, not underfunded.
- Set theses to [] (or omit) in the response.

Debug response:
- Always return selectedThesis.
- Return thesisError boolean and thesisErrorReason string when fallback is used.


## Task 16.2 — Separate Thesis Per Draft in Bundle Mode
Goal: Prevent thesis mismatch by generating and injecting separate theses for full_issue and insider_access when outputMode="bundle".

Update:
- app/api/issues/generate/route.ts

Behavior:
- If outputMode === "bundle":
  1) Run thesis generation twice:
     - once with mode label "full_issue"
     - once with mode label "insider_access"
  2) Select thesisFull and thesisInsider separately using Task 16 selection + guardrails.
  3) Inject thesisFull only into the full_issue drafting prompt.
  4) Inject thesisInsider only into the insider drafting prompt.
  5) Return in response:
     - selectedThesisFull
     - selectedThesisInsider
     - thesesFull (optional)
     - thesesInsider (optional)

- If outputMode === "full_issue" or "insider_access":
  - keep current single thesis behavior unchanged.

Constraints:
- No new DB schema.
- No new routes.
- Keep source restrictions intact.

## Task 16.3 — Draft Lint + Auto-Fix for Forbidden Patterns
Goal: Enforce brand rules reliably by detecting violations in generated drafts and applying a targeted rewrite pass.

Update:
- app/api/issues/generate/route.ts

Rules to enforce (must NOT appear):
- Any of:
  - "the real issue is"
  - "the real risk is"
  - "the real problem is"
- Any hyphen character "-" inside sentences (ban hyphen usage entirely for now)
  - examples to catch: "vendor-pitch", "compliance-theater", "machine-speed"
  - allow hyphens only if part of a URL (http/https)

Behavior:
1) After draft generation, run a lint check on:
   - draft (full issue)
   - insiderDraft (if present)
2) If violations found:
   - run a second Claude call: "Rewrite only the violating sentences/phrases to comply. Do not change structure. Do not add new facts. Do not add or remove sources."
   - Replace text with the corrected version.
3) Return:
   - lintFixed: boolean
   - lintViolations: string[] (for debugging)

Constraints:
- Do not change section order.
- Do not invent sources.
- Keep promo slot verbatim.
- No new DB schema or routes.

## Task 16.4 — Weighted Thesis Selection by Output Mode
Goal: Prevent full_issue thesis from drifting into the most dramatic option when a more useful thesis better fits the issue.

Update:
- app/api/issues/generate/route.ts

Behavior:
- When selecting a thesis (fallback selection or verification), compute weighted totals:
  - For outputMode "full_issue":
    weightedTotal = (operator_usefulness * 2) + (mode_fit * 1.5) + tension + distinctiveness
  - For outputMode "insider_access":
    weightedTotal = (tension * 2) + operator_usefulness + distinctiveness + mode_fit
- Use weightedTotal for selecting max when selected_id is missing OR when validation forces re-selection.
- Return weightedTotal for each thesis in debug response (optional).

## Task 16.5 — Lint Scope Refinement (Do Not Flag Formatting)
Goal: Enforce "no hyphens inside sentences" without breaking required formatting like Sources lists or horizontal rules.

Update:
- app/api/issues/generate/route.ts

Behavior:
- Lint should NOT scan:
  - Any line that starts with "Sources:"
  - Any line that matches /^-\shttps?:\/\//
  - Any line that is exactly "---"
- Lint SHOULD scan prose lines for '-' usage and forbidden phrases.

Additionally:
- Do not rewrite entire draft on lint fix.
- Only rewrite the minimal set of offending sentences (pass them to Claude as a list).
- Reinsert corrected sentences back into the draft.

Return:
- lintViolations as structured items: [{ type, snippet, lineNumber }]


## Task 17 — Editor Review Pack (single response, multi-artifact)
Goal: Produce an "Editor Pack" response that helps David review and direct the newsroom quickly without re-reading raw drafts first.

Update:
- app/api/issues/generate/route.ts

When:
- Applies to outputMode "bundle" only (for now).
- Should work even if insiderDraft is empty or generation fails (graceful fallback).

Output:
Return JSON with these top-level keys:
{
  ok: true,
  editorPack: {
    theses: {
      full_issue: { selected: string, selectedBy: "editor"|"model"|"fallback" },
      insider_access: { selected: string, selectedBy: "editor"|"model"|"fallback" }
    },
    angleSummary: {
      full_issue: string,          // 1 short paragraph max 3 sentences
      insider_access: string        // 1 short paragraph max 3 sentences
    },
    titleOptions: string[],         // exactly 3, based on thesisFull
    hookOptions: string[],          // exactly 3, based on thesisFull, 2-4 short lines each
    redlines: string[],             // max 7 bullets, specific, actionable, no fluff
    drafts: {
      full_issue: string,
      insider_access: string
    }
  },
  lintFixed: boolean,
  lintViolations: any,
  selectedThesisFull: string,
  selectedThesisInsider: string
}

Rules:
- No meta commentary in the strings.
- No dashes inside prose sentences (en dash/em dash). Avoid "The real issue is" / "The real risk is" / "The real problem is".
- Do not invent sources. Do not change the Sources blocks in drafts.
- Promo Slot must remain verbatim in full_issue draft.

How:
1) Generate drafts as currently (full_issue + insider_access) using existing logic.
2) After drafts are generated and linted, call Claude one more time to produce the Editor Pack fields:
   - angleSummary.full_issue
   - angleSummary.insider_access
   - titleOptions (3)
   - hookOptions (3)
   - redlines (<=7)
3) Claude must return STRICT JSON only (no markdown).

Editor Pack prompt (use verbatim):

SYSTEM (editor_pack):
You are the Identity Jedi editor. Output strict JSON only. No markdown. No commentary.

USER (editor_pack):
Create an editor review pack for the drafts below.

Constraints:
- angleSummary: max 3 sentences each, must reflect the selected thesis for that draft.
- titleOptions: exactly 3 title options for the full issue, sharp and specific.
- hookOptions: exactly 3 hook options for the full issue, each 2 to 4 short lines, no fluff.
- redlines: max 7 bullets. Each must be specific and actionable. Call out weak takes, repeated phrasing, missing angle, unclear claims, and where to tighten.

Hard rules:
- Do not add new facts.
- Do not invent sources.
- Do not use em dashes or en dashes.
- Avoid phrases: "the real issue is", "the real risk is", "the real problem is".

Return strict JSON in this shape:
{
  "angleSummary": {
    "full_issue": "...",
    "insider_access": "..."
  },
  "titleOptions": ["...", "...", "..."],
  "hookOptions": ["line1\nline2", "line1\nline2\nline3", "line1\nline2\nline3\nline4"],
  "redlines": ["...", "..."]
}

Selected theses:
Full issue: ${selectedThesisFull}
Insider: ${selectedThesisInsider}

Full issue draft:
${draftText}

Insider draft:
${insiderDraftText}

Failure handling:
- If Claude editor_pack call fails, still return drafts as before.
- Add editorPackError boolean and editorPackErrorReason string when fallback occurs.

## Task 17.1: Enforce Style Lint (No "the real..." + No Hyphens) Across Drafts

### Objective
Add a deterministic styleLint() layer to the issue generation route so we reliably catch:
1) "the real (issue|risk|problem|battlefield|gap|exposure)"
2) Em dash or en dash characters
3) word-hyphen-word constructs
While allowing hyphens inside URLs.

### Why
Current redlines detect violations conceptually, but lintViolations is not catching them in output.
We need deterministic enforcement so the system does not drift stylistically.

### Rules To Enforce

1) Forbidden phrase (case-insensitive):
   \bthe real (issue|risk|problem|battlefield|gap|exposure)\b

2) Any em dash or en dash:
   — or –

3) Any word-hyphen-word:
   \b\w+-\w+\b
   BUT ignore matches inside URLs.

### URL Handling
Treat anything matching:
   https?:\/\/\S+
as a protected region where hyphen checks are skipped.

### Required Output
The API response must include:

{
  lintFixed: false,
  lintViolations: [
    {
      type: "forbidden_phrase" | "hyphen" | "dash",
      pattern: string,
      snippet: string,
      lineNumber: number
    }
  ]
}

### Acceptance Criteria
- "the real issue" is flagged.
- "machine-speed" is flagged.
- "state-backed" is flagged.
- URLs with hyphens are NOT flagged.
- Em dashes are flagged.
- Violations include accurate line numbers.

## Task 17.2: Enforce Structural Novelty in EditorPack Hooks

### Objective
Prevent cadence remix loops by forcing hookOptions to follow three distinct structural templates.

### Hook Structure Rules

Hook 1:
- Blunt thesis
- Exactly 2 lines

Hook 2:
- Statistic or punch framing
- 2 to 3 lines

Hook 3:
- Contrast or tension framing
- 3 to 4 lines

Additional Constraints:
- Hooks must not reuse the same opening phrase.
- Hooks must not share the same sentence structure.
- No "the real..." phrasing.
- No em dash or en dash.
- Avoid word-hyphen-word phrasing.

### Acceptance Criteria
- Hooks clearly feel structurally different.
- Not minor rewrites of each other.
- Respect global IDJ style rules.

## Task 17.3: Enforce Title Novelty (No Repeats, 3 Distinct Title Formats)

### Objective
Make titleOptions reliably produce 3 distinct title styles so we stop getting slight remixes of the same title every run.

### Why
Right now titles often feel like rephrases.
We want the system to feel like a newsroom desk with intentional variety.

### Title Output Rules
Return exactly 3 titles.

Each title must follow a different format:

Title 1: Declarative Thesis (3 to 7 words)
- Direct statement
- No punctuation required
Examples: "Identity at Machine Speed", "AI Breaks Identity Governance"

Title 2: Tension / Contrast (6 to 12 words)
- Must include a contrast cue: "while", "as", "when"
- Must NOT use "versus"
Examples: "AI Ships Faster While Governance Crawls", "Agents Scale When Controls Stay Human"

Title 3: Operator Framing (6 to 12 words)
- Must imply action or consequence
- Must NOT start with "How to"
Examples: "What to Fix Before Agents Own Your Control Plane"

### Global Title Constraints
- No "the real..." phrasing.
- No em dash or en dash.
- Avoid word-hyphen-word phrasing.
- Must not repeat the same key noun phrase across titles (e.g., don’t use "machine speed" in more than one title).
- Must not start with the same first word across titles.

### Acceptance Criteria
- 3 titles feel meaningfully different.
- Titles comply with constraints.
- Titles do not look like synonyms of each other.

 ## Task 17.4 — Relax dash rule: ban only em/en dashes, allow hyphenated words

### Goal
We overindexed on “no dashes” and accidentally banned all hyphenated words. The actual writing rule is:
- No em dash (—) or en dash (–)
- Hyphenated words are OK

Update the generate route, linting, prompts, and smoke test to match that rule.

### Requirements
1) Stop flagging hyphenated words as violations anywhere.
2) Keep banning em dash and en dash everywhere.
3) Keep banning the phrase pattern:
   - `\bthe real (issue|risk|problem|battlefield|gap|exposure)\b` (case-insensitive)
4) Remove all hyphen rewriting and replacements intended to “de-hyphenate” normal prose.
5) Smoke test should only fail for:
   - em/en dashes
   - forbidden “the real …” phrasing
   Not for hyphenated words.

### Files to change
- `app/api/issues/generate/route.ts`
- `scripts/smoke-editor-pack-17.ts`

### Implementation steps

#### 17.4.1 — Editor pack prompt: allow hyphenated words
In `app/api/issues/generate/route.ts`, inside `runEditorPack()` prompt:
- Remove any instruction that discourages hyphenated words, specifically:
  - Remove `Avoid word-hyphen-word phrasing.` from title constraints
  - Remove `Avoid word-hyphen-word phrasing.` from hook constraints
- Keep:
  - No em dash or en dash characters
  - No forbidden “the real (issue|risk|problem|battlefield|gap|exposure)” phrasing

#### 17.4.2 — Remove hyphen replacement map and replace with em/en dash normalization only
In `app/api/issues/generate/route.ts`:
- Delete `DASH_REPLACE_MAP` and `applyDashReplaceMap()`
- Add a new helper:
  - `normalizeLongDashes(text)` that replaces only `—` and `–` with a single space

Update all call sites:
- Replace every `applyDashReplaceMap(...)` call with `normalizeLongDashes(...)`

#### 17.4.3 — Simplify style lint to only enforce forbidden phrase + em/en dashes
In `app/api/issues/generate/route.ts`:
- In `styleLint()` remove:
  - URL span logic
  - `STYLE_WORD_HYPHEN_WORD`
  - Any `word_hyphen_word` violations
- Keep checks for:
  - `STYLE_FORBIDDEN_PHRASE` = `\bthe real (issue|risk|problem|battlefield|gap|exposure)\b`
  - `STYLE_EM_EN_DASH` = `[\u2014\u2013]`

#### 17.4.4 — Simplify draft lint to only enforce forbidden phrases + em/en dashes
In `app/api/issues/generate/route.ts`:
- In `lintDraft()` remove checks for:
  - space-dash-space
  - word-hyphen-word
  - URL stripping logic used only for hyphen detection
- Keep:
  - forbidden phrase checks using existing `FORBIDDEN_LINT_PATTERNS`
  - em/en dash detection
- Update `rewriteLintViolations()` prompt so it only instructs Claude to fix:
  - forbidden phrases: “the real issue is”, “the real risk is”, “the real problem is”
  - em dash / en dash characters
  Remove any instruction about hyphens.

#### 17.4.5 — Update generation prompts: ban only em/en dashes
In `app/api/issues/generate/route.ts`, update all prompt rules that currently say “no dashes” or “no hyphens”:
- Replace with: “No em dash (—) or en dash (–) characters in sentences.”
Apply to:
- `generateEditorialAngle` system rules
- `generateInsiderDraft` user rules and system prompt
- full issue `userPrompt` rules
- full issue `systemPrompt` rules

#### 17.4.6 — Update smoke test: remove hyphen failure, keep em/en + forbidden phrase
In `scripts/smoke-editor-pack-17.ts`:
- Remove any check that fails on hyphenated words (including `\w-\w`).
- Keep or add checks that fail if:
  - draft contains `—` or `–`
  - draft contains forbidden “the real (issue|risk|problem|battlefield|gap|exposure)” phrasing (case-insensitive)
- Run these checks against:
  - `draft`
  - `insiderDraft` (when bundle mode returns it)

### Acceptance criteria
- Running `pnpm smoke:17` passes when drafts contain normal hyphenated words like “nation-state” or “AI-powered”.
- Smoke test fails if drafts contain `—` or `–`.
- Smoke test fails if drafts contain “the real risk” / “the real problem” / “the real gap” etc.
- API response still includes `editorPack` in bundle mode.