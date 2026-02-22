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