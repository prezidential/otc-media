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