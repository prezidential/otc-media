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