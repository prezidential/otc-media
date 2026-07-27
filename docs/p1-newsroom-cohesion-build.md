# P1 — Newsroom Cohesion: build checklist

**Spec:** `docs/cornerstone-system-spec.md` §3.19 (normative). This is the granular execution plan.
**Owner:** Darius (build), David (review/approve). **Created:** 2026-06-08. **Status note (2026-07-27):** P1a–P1d foundations have shipped on `main` (PRs #112, #114, #116, #119, #120). Treat unchecked items below as remaining work before the dogfood acceptance test passes. Operator setup for the performance cache: README **Post Performance Cache Runbook**.
**Goal:** make Cornerstone's four surfaces (brainstorm, draft, analytics, push) one cohesive newsroom — mostly UX + wiring over capabilities that already exist.
**Branch strategy:** one branch per sub-phase (P1a…P1d), each its own PR off `origin/main`. Don't merge to production without David's OK (Vercel auto-deploys main).

---

## Pre-flight (verify before building)
- [x] Read the real current `app/dashboard/page.tsx` + `lib/dashboard/stats` to see exactly what `GET /api/dashboard/stats` returns today.
- [x] Read `app/api/brainstorm/sessions/[id]/promote-draft/route.ts` — returns `{ ok, draftId }` and UI deep-links to `/issues?draft=<id>`.
- [x] Read `lib/studio/nav.ts` — now `STUDIO_NAV_SECTIONS` (loop spine + Pipeline + Setup).
- [x] Confirm the analytics shapes available from `lib/integrations/` (Beehiiv post stats) for post-publish metrics.

## P1a — Newsroom home (the single pane)
- [x] Extend `GET /api/dashboard/stats` with newsroom rollups (brainstorms, draft/reviewed/published counts, latest published, subscriber-health summary).
- [x] Render newsroom status cards on `app/dashboard/page.tsx` (additive to Studio chrome).
- [ ] Scheduled/next-publish state + recent-post performance card on the home.
- [ ] Health/performance-aware next-action nudge (current nudge is still leads/drafts/stale-research oriented).
- [x] Keep the §3.15 Studio chrome/tokens; this is additive to the existing dashboard, not a rewrite of the shell.
- [ ] Broader endpoint-shape + dashboard-render tests for the full `newsroom` payload.
- **Acceptance:** a creator sees, on one screen, everything in flight and the single most important next action.

## P1b — Cross-surface handoffs
- [x] Signals → Brainstorm: signal rows → `/brainstorm?signalId=` → session create with `seed_signal_id` + `seed_source='signal'`.
- [x] Brainstorm → Issues: `promote-draft` returns `{ draftId }`; UI routes to `/issues?draft=<id>`.
- [ ] Issues → Analytics: a "Performance" link on a published issue → that post's metrics.
- [ ] Analytics → Brainstorm/Issues: links from the analytics surfaces into a seeded brainstorm or the relevant issue.
- [x] Schema: `brainstorm_sessions.seed_signal_id` + `seed_source` in `lib/supabase/schema-brainstorm.sql` (apply current file to persist provenance).
- **Acceptance:** no dead ends — every surface offers the obvious next hop, and the brainstorm→draft landing is visible and correct.

## P1c — Analytics feedback loop
- [x] Workspace `post_performance` cache + `POST /api/analytics/sync-posts` (dashboard load refreshes in background). See README Post Performance Cache Runbook.
- [ ] Attribute provider posts to issue drafts. Proposed `issue_drafts.performance_json` was not added; Publisher does not trigger sync.
- [ ] Show performance on the issue (Issues page) and in the home snapshot.
- [x] `get_top_performing_themes` Brainstormer tool registered — reads `post_performance` by click rate (post titles/rates; not yet `content_lanes` themes).
- [x] `get_audience_health` Brainstormer tool — reads `subscriber_health_history`.
- [ ] "Themes that resonated" dashboard card.
- [ ] Health-to-action: a red §3.17 KPI on the home → one-click seed a brainstorm (`seed_source='health'`).
- **Acceptance:** ideation can be grounded in what converted, and a publish round-trips its numbers back to the issue and the home.

## P1d — Nav / IA cleanup
- [x] `lib/studio/nav.ts`: promote the loop spine (Dashboard, Brainstorm, Issues, Analytics); group the rest under Pipeline and Setup.
- [ ] Add a "New brainstorm" CTA on the home and the sidebar.
- [ ] Reconcile with §3.15's IA contract (update §3.15 if the final nav differs).
- **Acceptance:** a first-time creator immediately sees where to start and the spine of the workflow.

---

## Definition of done (P1 overall — the dogfood test)
Run a real loop inside Cornerstone with no external tools: open the home → start a brainstorm from a signal or a health alert → promote to a draft → edit/approve in Issues → publish → see the post's performance return to the home. When that round-trip works end to end, P1 ships.

**Current boundary:** signal → brainstorm → draft → publish works, and a workspace-level post cache feeds Brainstormer tools. Performance is not yet mapped back to the issue/home, and health/analytics-seeded handoffs remain open — P1 is partial.

## Out of scope (own phases)
LinkedIn engine (§3.8 / Phase 3), source discovery + signal scoring (§3.3 Phase 2/3), onboarding wizard rework (§3.9), billing (§8).
