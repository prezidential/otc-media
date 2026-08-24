# P1 — Newsroom Cohesion: build checklist

**Spec:** `docs/cornerstone-system-spec.md` §3.19 (normative). This is the granular execution plan.
**Owner:** Darius (build), David (review/approve). **Created:** 2026-06-08.
**Goal:** make Cornerstone's four surfaces (brainstorm, draft, analytics, push) one cohesive newsroom — mostly UX + wiring over capabilities that already exist.
**Branch strategy:** one branch per sub-phase (P1a…P1d), each its own PR off `origin/main`. Don't merge to production without David's OK (Vercel auto-deploys main).

---

## Pre-flight (verify before building)
- [ ] Read the real current `app/dashboard/page.tsx` + `lib/dashboard/stats` to see exactly what `GET /api/dashboard/stats` returns today.
- [ ] Read `app/api/brainstorm/sessions/[id]/promote-draft/route.ts` — confirm what it returns and where it lands today (the opaque handoff).
- [ ] Read `lib/studio/nav.ts` for the current nav list (≈12 items).
- [ ] Confirm the analytics shapes available from `lib/integrations/` (Beehiiv post stats) for post-publish metrics.

## P1a — Newsroom home (the single pane)
- [ ] Extend `GET /api/dashboard/stats` to return rollups: active brainstorm sessions, drafts grouped by status (draft/reviewed/scheduled/published), next-scheduled + last-published issue, a performance snapshot (recent post open/click), and the §3.17 health KPIs.
- [ ] Redesign `app/dashboard/page.tsx` into the status home: brainstorms card, drafts-by-status board (deep links to `/issues`), publish state, performance + health snapshot, one generalized next-action nudge.
- [ ] Keep the §3.15 Studio chrome/tokens; this is additive to the existing dashboard, not a rewrite of the shell.
- [ ] Tests: stats endpoint shape; dashboard renders each section from a mocked payload.
- **Acceptance:** a creator sees, on one screen, everything in flight and the single most important next action.

## P1b — Cross-surface handoffs
- [ ] Signals → Brainstorm: add "Explore in Brainstorm" on a signal row → `POST /api/brainstorm/sessions` seeded with `seed_signal_id` + `seed_source='signal'` → route into the new session.
- [ ] Brainstorm → Issues: make `promote-draft` return `{ draftId }`; route the UI to `/issues?draft=<id>` and show a confirmation toast. `app/issues/page.tsx` reads `?draft=` and loads that draft.
- [ ] Issues → Analytics: a "Performance" link on a published issue → that post's metrics.
- [ ] Analytics → Brainstorm/Issues: links from the analytics surfaces into a seeded brainstorm or the relevant issue.
- [ ] Schema: add `brainstorm_sessions.seed_signal_id` (nullable) + `seed_source` (text/enum). RLS unchanged (same table).
- **Acceptance:** no dead ends — every surface offers the obvious next hop, and the brainstorm→draft landing is visible and correct.

## P1c — Analytics feedback loop
- [ ] Post-publish metrics: after a Publisher run, fetch the Beehiiv post stats and write `issue_drafts.performance_json`. Add `performance_json` (nullable JSONB) to `issue_drafts` (+ RLS unchanged). Backfill optional.
- [ ] Show performance on the issue (Issues page) and in the home snapshot.
- [ ] `get_top_performing_themes` Brainstormer tool: reads §3.18 analytics + `content_lanes`, returns top themes; register it in `lib/brainstorm/signal-tools.ts` (or sibling) and the brainstormer tool loop.
- [ ] "Themes that resonated" dashboard card.
- [ ] Health-to-action: a red §3.17 KPI on the home → one-click seed a brainstorm (`seed_source='health'`).
- **Acceptance:** ideation can be grounded in what converted, and a publish round-trips its numbers back to the issue and the home.

## P1d — Nav / IA cleanup
- [ ] `lib/studio/nav.ts`: promote the loop spine (Home, Brainstorm, Issues, Analytics) to primary; group the rest (Signals, Leads, Research, Outlines, Runs, ACE, Brand, Integrations) under a secondary section.
- [ ] Add a "New brainstorm" CTA on the home and the sidebar.
- [ ] Reconcile with §3.15's IA contract (update §3.15 if the final nav differs).
- **Acceptance:** a first-time creator immediately sees where to start and the spine of the workflow.

---

## Definition of done (P1 overall — the dogfood test)
Run a real loop inside Cornerstone with no external tools: open the home → start a brainstorm from a signal or a health alert → promote to a draft → edit/approve in Issues → publish → see the post's performance return to the home. When that round-trip works end to end, P1 ships.

## Out of scope (own phases)
LinkedIn engine (§3.8 / Phase 3), source discovery + signal scoring (§3.3 Phase 2/3), billing (§8). Creator onboarding is shipped (M1, §3.9) and is not P1 work.
