# P1 — Newsroom Cohesion: build checklist

**Spec:** `docs/cornerstone-system-spec.md` §3.19 (normative). This is the granular execution plan.
**Owner:** Darius (build), David (review/approve). **Created:** 2026-06-08. **Status refreshed:** 2026-08-03 (docs automation — verified against `main`).
**Goal:** make Cornerstone's four surfaces (brainstorm, draft, analytics, push) one cohesive newsroom — mostly UX + wiring over capabilities that already exist.
**Branch strategy:** one branch per sub-phase (P1a…P1d), each its own PR off `origin/main`. Don't merge to production without David's OK (Vercel auto-deploys main).

---

## Pre-flight (verify before building)
- [x] Read the real current `app/dashboard/page.tsx` + `lib/dashboard/stats` to see exactly what `GET /api/dashboard/stats` returns today.
- [x] Read `app/api/brainstorm/sessions/[id]/promote-draft/route.ts` — confirm what it returns and where it lands today (`{ ok, draftId }` → `/issues?draft=`).
- [x] Read `lib/studio/nav.ts` for the current nav list (loop spine + Pipeline/Setup sections).
- [x] Confirm the analytics shapes available from `lib/integrations/` (Beehiiv post stats) for post-publish metrics.

## P1a — Newsroom home (the single pane)
- [x] Extend `GET /api/dashboard/stats` to return rollups: active brainstorm sessions, drafts grouped by status (draft/reviewed/scheduled/published), next-scheduled + last-published issue, a performance snapshot (recent post open/click), and the §3.17 health KPIs.
- [x] Redesign `app/dashboard/page.tsx` into the status home: brainstorms card, drafts-by-status board (deep links to `/issues`), publish state, performance + health snapshot, one generalized next-action nudge.
- [x] Keep the §3.15 Studio chrome/tokens; this is additive to the existing dashboard, not a rewrite of the shell.
- [x] Tests: stats endpoint shape; dashboard helpers covered in Vitest.
- **Acceptance:** a creator sees, on one screen, everything in flight and the single most important next action. *(Shipped as MVP home — continue polish as dogfood requires.)*

## P1b — Cross-surface handoffs
- [x] Signals → Brainstorm: signal row / dashboard link → `/brainstorm?signalId=` → `POST /api/brainstorm/sessions` with `seedSignalId` + `seedSource='signal'`.
- [x] Brainstorm → Issues: `promote-draft` returns `{ draftId }`; UI routes to `/issues?draft=<id>` with confirmation. `app/issues/page.tsx` reads `?draft=` and loads that draft.
- [ ] Issues → Analytics: a "Performance" link on a published issue → that post's metrics.
- [ ] Analytics → Brainstorm/Issues: links from health / themes surfaces into a seeded brainstorm or the relevant issue (health seed CTA still open).
- [x] Schema: `brainstorm_sessions.seed_signal_id` (nullable) + `seed_source` (text). RLS unchanged (same table).
- **Acceptance:** no dead ends — every surface offers the obvious next hop, and the brainstorm→draft landing is visible and correct. *(Promote + signal seed shipped; Issues↔Analytics and health seed remain.)*

## P1c — Analytics feedback loop
- [x] Post-level metrics cache: `POST /api/analytics/sync-posts` + `lib/analytics/syncPostPerformance.ts` upsert `post_performance` (Beehiiv open/click). Dashboard triggers sync on load.
- [ ] Issue-attributed metrics: write `issue_drafts.performance_json` after Publisher and show performance on the issue + home snapshot tied to that draft.
- [x] `get_top_performing_themes` Brainstormer tool: reads `post_performance`, ranks by click rate; registered in `lib/brainstorm/signal-tools.ts` + system prompt. *(Does **not** yet aggregate `content_lanes` / editorial themes.)*
- [x] `get_audience_health` Brainstormer tool: reads `subscriber_health_history` (no live API).
- [x] "Themes that resonated" dashboard surface from the same cache.
- [ ] Health-to-action: a red §3.17 KPI on the home → one-click seed a brainstorm (`seed_source='health'`).
- **Acceptance:** ideation can be grounded in what converted, and a publish round-trips its numbers back to the issue and the home. *(Cache + tools shipped; issue round-trip + health CTA remain.)*

## P1d — Nav / IA cleanup
- [x] `lib/studio/nav.ts`: promote the loop spine (Dashboard, Brainstorm, Issues, Analytics) to primary; group Pipeline (Signals, Leads, Research, Outlines, Runs) and Setup (Brand, ACE, Integrations) under secondary sections.
- [ ] Add a dedicated "New brainstorm" CTA on the home and the sidebar (deep links / promote paths exist; explicit CTA polish still useful).
- [x] Reconcile with §3.15's IA contract (spine vs flat list — documented in nav source + §3.19).
- **Acceptance:** a first-time creator immediately sees where to start and the spine of the workflow. *(Spine shipped.)*

---

## Definition of done (P1 overall — the dogfood test)
Run a real loop inside Cornerstone with no external tools: open the home → start a brainstorm from a signal or a health alert → promote to a draft → edit/approve in Issues → publish → see the post's performance return to the home **and** the originating issue. When that round-trip works end to end, P1 ships.

**Current gap vs dogfood:** signal→brainstorm→promote→issues works; post_performance cache feeds brainstorm/dashboard; missing issue-attributed performance, Issues→Analytics link, and health-seeded brainstorm CTA.

## Out of scope (own phases)
LinkedIn engine (§3.8 / Phase 3), source discovery + signal scoring (§3.3 Phase 2/3), onboarding wizard rework (§3.9), billing (§8).
