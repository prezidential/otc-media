import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/auth/session";
import {
  buildNudge,
  draftTitle,
  greetingParts,
  lastIngestStale,
  pickNeedsYou,
  summarizeHealth,
  type DashboardStatsPayload,
  type HealthRow,
  type NewsroomSummary,
} from "@/lib/dashboard/stats";

export async function GET() {
  const ctx = await requireWorkspace();
  if (ctx instanceof Response) return ctx;
  const { supabase, workspaceId } = ctx;

  const [
    signalsCountRes,
    leadsPendingRes,
    issuesRes,
    outlinesRes,
    oldestPendingRes,
    runsRes,
  ] = await Promise.all([
    supabase.from("signals").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId),
    supabase
      .from("editorial_leads")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("status", "pending_review"),
    supabase
      .from("issue_drafts")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .or("status.is.null,status.eq.draft,status.eq.reviewed"),
    supabase
      .from("content_outlines")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .is("disabled_at", null),
    supabase
      .from("editorial_leads")
      .select("created_at")
      .eq("workspace_id", workspaceId)
      .eq("status", "pending_review")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("runs")
      .select("started_at,finished_at,output_refs_json,status,run_type")
      .eq("workspace_id", workspaceId)
      .eq("run_type", "directive_ingest")
      .eq("status", "completed")
      .order("finished_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const researchCount = signalsCountRes.count ?? 0;
  const leadsPending = leadsPendingRes.count ?? 0;
  let issuesDraft = issuesRes.count ?? 0;
  if (issuesRes.error) {
    const fb = await supabase
      .from("issue_drafts")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId);
    issuesDraft = fb.count ?? 0;
  }
  const outlinesCount = outlinesRes.error ? 0 : outlinesRes.count ?? 0;

  const lastRun = runsRes.data;
  const lastAt = lastRun?.finished_at ?? lastRun?.started_at ?? null;
  const inserted =
    lastRun?.output_refs_json && typeof lastRun.output_refs_json === "object" && "inserted" in lastRun.output_refs_json
      ? Number((lastRun.output_refs_json as { inserted?: number }).inserted)
      : null;
  const staleResearch = lastIngestStale(lastRun?.finished_at ?? null, lastRun?.started_at ?? null);

  let oldestDays: number | null = null;
  if (oldestPendingRes.data?.created_at) {
    oldestDays = Math.max(
      1,
      Math.floor((Date.now() - new Date(oldestPendingRes.data.created_at as string).getTime()) / (24 * 60 * 60 * 1000))
    );
  }

  const needsYou = pickNeedsYou({
    leadsPending,
    issuesDraft,
    staleResearch,
    outlinesCount,
  });

  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count: signals24 } = await supabase
    .from("signals")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .gte("captured_at", since24h);

  const greeting = greetingParts();
  const nudge = buildNudge({
    leadsPending,
    oldestPendingLeadDays: oldestDays,
    issuesDraft,
    staleResearch,
  });

  // --- Newsroom rollup (§3.19 P1a): the whole loop at a glance. ---
  const since14d = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const [
    brainstormActiveRes,
    brainstormLatestRes,
    draftOnlyRes,
    reviewedRes,
    publishedCountRes,
    lastPublishedRes,
    healthRes,
  ] = await Promise.all([
    supabase
      .from("brainstorm_sessions")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .gte("updated_at", since14d),
    supabase
      .from("brainstorm_sessions")
      .select("id,title,updated_at")
      .eq("workspace_id", workspaceId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("issue_drafts")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .or("status.is.null,status.eq.draft"),
    supabase
      .from("issue_drafts")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("status", "reviewed"),
    supabase
      .from("issue_drafts")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("status", "published"),
    supabase
      .from("issue_drafts")
      .select("id,content_json,created_at")
      .eq("workspace_id", workspaceId)
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("subscriber_health_history")
      .select("metric,last_status,last_value,updated_at")
      .eq("workspace_id", workspaceId),
  ]);

  const latestBrainstorm = brainstormLatestRes.data;
  const lastPublished = lastPublishedRes.data;
  const newsroom: NewsroomSummary = {
    brainstorms: {
      active: brainstormActiveRes.error ? 0 : brainstormActiveRes.count ?? 0,
      latest:
        latestBrainstorm && typeof latestBrainstorm.id === "string"
          ? {
              id: latestBrainstorm.id,
              title: (latestBrainstorm.title as string) || "Brainstorm",
              updatedAt: latestBrainstorm.updated_at as string,
            }
          : null,
    },
    drafts: {
      draft: draftOnlyRes.error ? 0 : draftOnlyRes.count ?? 0,
      reviewed: reviewedRes.error ? 0 : reviewedRes.count ?? 0,
      published: publishedCountRes.error ? 0 : publishedCountRes.count ?? 0,
    },
    lastPublished:
      lastPublished && typeof lastPublished.id === "string"
        ? {
            id: lastPublished.id,
            title: draftTitle(lastPublished.content_json),
            at: lastPublished.created_at as string,
          }
        : null,
    health: healthRes.error ? null : summarizeHealth((healthRes.data ?? []) as HealthRow[]),
  };

  const payload: DashboardStatsPayload = {
    newsroom,
    pipeline: {
      research: { count: researchCount, sublabel: "signals" },
      leads: { count: leadsPending, sublabel: "to approve" },
      issues: { count: issuesDraft, sublabel: "in draft" },
      outlines: { count: outlinesCount, sublabel: "active" },
    },
    needsYou,
    sidebar: {
      signalsIngestedLine: `${signals24 ?? 0} signals ingested (24h)`,
      leadsLine: `${leadsPending} lead${leadsPending === 1 ? "" : "s"} to approve`,
      issuesLine: `${issuesDraft} issue${issuesDraft === 1 ? "" : "s"} drafting`,
      signalsIngested24h: signals24 ?? 0,
      leadsToApprove: leadsPending,
      issuesDrafting: issuesDraft,
    },
    greeting,
    nudge,
    lastIngest: {
      at: lastAt,
      inserted: Number.isFinite(inserted) ? inserted : null,
      isStale: staleResearch,
    },
  };

  return NextResponse.json(payload);
}
