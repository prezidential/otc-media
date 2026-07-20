# P1 — Newsroom Cohesion: build checklist

**Spec:** `docs/cornerstone-system-spec.md` §3.19 (normative). This is the granular execution plan.
**Owner:** Darius (build), David (review/approve). **Created:** 2026-06-08. **Status updated:** 2026-07-20.
**Goal:** make Cornerstone's four surfaces (brainstorm, draft, analytics, push) one cohesive newsroom — mostly UX + wiring over capabilities that already exist.
**Branch strategy:** one branch per sub-phase (P1a…P1d), each its own PR off `origin/main`. Don't merge to production without David's OK (Vercel auto-deploys main).

Status below reflects source on `main`, not the original plan. Checked items are shipped; unchecked items remain before the full-loop acceptance test passes.

---

## Pre-flight (verify before building)
- [x] Read `app/dashboard/page.tsx`, `app/api/dashboard/stats/route.ts`, and `lib/dashboard/stats.ts`.
- [x] Read `app/api/brainstorm/sessions/[id]/promote-draft/route.ts`; it returns `{ ok, draftId }`.
- [x] Read `lib/studio/nav.ts`; navigation is now grouped through `STUDIO_NAV_SECTIONS`.
- [x] Confirm Beehiiv post shapes from `lib/integrations/beehiiv/normalize.ts`.

## P1a — Newsroom home (the single pane)
- [x] Extend `GET /api/dashboard/stats` with `newsroom`: brainstorms updated in the last 14 days, draft/reviewed/published counts, latest published draft, and §3.17 health status.
- [x] Render Brainstorms, Drafts, Last published, and Subscriber health cards on `/dashboard`.
- [ ] Add scheduled/next-publish state and a recent-post performance card. Neither is present in the current payload or UI.
- [ ] Expand the next-action nudge to account for health/performance; it currently uses leads, drafts, and stale research only.
- [x] Keep the §3.15 Studio chrome/tokens; the newsroom cards are additive to the existing dashboard and shell.
- [x] Tests cover dashboard rollup helpers in `__tests__/lib/dashboard-stats-helpers.test.ts`.
- [ ] Add endpoint-shape and dashboard-render tests for the `newsroom` payload.
- **Acceptance:** a creator sees, on one screen, everything in flight and the single most important next action.

## P1b — Cross-surface handoffs
- [x] Signals → Brainstorm: signal rows link to `/brainstorm?signalId=<id>`; session creation sends `seedSignalId` + `seedSource: "signal"`.
- [x] Brainstorm → Issues: `promote-draft` returns `{ draftId }`; the UI routes to `/issues?draft=<id>`, which loads the draft.
- [ ] Issues → Analytics: a "Performance" link on a published issue → that post's metrics.
- [ ] Analytics → Brainstorm/Issues: links from the analytics surfaces into a seeded brainstorm or the relevant issue.
- [x] Schema: `lib/supabase/schema-brainstorm.sql` adds nullable `seed_signal_id` + `seed_source`. Apply the current file to persist provenance; session creation deliberately ignores a failed best-effort provenance update.
- **Acceptance:** no dead ends — every surface offers the obvious next hop, and the brainstorm→draft landing is visible and correct.

## P1c — Analytics feedback loop
- [x] Add workspace-level `post_performance` cache and `POST /api/analytics/sync-posts`; dashboard load refreshes up to 20 published Beehiiv posts in the background.
- [ ] Attribute provider posts to issue drafts. The proposed `issue_drafts.performance_json` was not added, and Publisher does not trigger the performance sync.
- [ ] Show performance on the issue (Issues page) and in the home snapshot.
- [x] Register `get_top_performing_themes` in the Brainstormer tool loop; it reads `post_performance`, ranks by click rate, and returns recent post titles/rates without a live call.
- [ ] Aggregate actual themes/content lanes; the current tool name is aspirational and does not read `content_lanes`.
- [x] Register `get_audience_health`; it reads stored `subscriber_health_history` without a live call.
- [ ] "Themes that resonated" dashboard card.
- [ ] Health-to-action: a red §3.17 KPI on the home → one-click seed a brainstorm (`seed_source='health'`).
- [ ] Operational setup: apply `lib/supabase/schema-post-performance.sql`. An empty cache is expected until `POST /api/analytics/sync-posts` succeeds with an enabled Beehiiv integration.
- **Acceptance:** ideation can be grounded in what converted, and a publish round-trips its numbers back to the issue and the home.

## P1d — Nav / IA cleanup
- [x] `lib/studio/nav.ts`: promote the loop spine (Dashboard, Brainstorm, Issues, Analytics); group the rest under Pipeline and Setup.
- [ ] Add a "New brainstorm" CTA on the home and the sidebar.
- [ ] Reconcile with §3.15's IA contract (update §3.15 if the final nav differs).
- **Acceptance:** a first-time creator immediately sees where to start and the spine of the workflow.

---

## Definition of done (P1 overall — the dogfood test)
Run a real loop inside Cornerstone with no external tools: open the home → start a brainstorm from a signal or a health alert → promote to a draft → edit/approve in Issues → publish → see the post's performance return to the home. When that round-trip works end to end, P1 ships.

**Current boundary:** the loop supports signal → brainstorm → draft → publish and maintains a workspace-level post cache. It does not yet map performance back to the issue/home or support health/analytics-seeded handoffs, so P1 remains partial.

## Out of scope (own phases)
LinkedIn engine (§3.8 / Phase 3), source discovery + signal scoring (§3.3 Phase 2/3), onboarding wizard rework (§3.9), billing (§8).
