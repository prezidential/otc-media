import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import {
  buildNudge,
  greetingParts,
  lastIngestStale,
  pickNeedsYou,
  type DashboardStatsPayload,
} from "@/lib/dashboard/stats";

export async function GET() {
  const workspaceId = process.env.WORKSPACE_ID;
  if (!workspaceId) {
    return NextResponse.json({ error: "WORKSPACE_ID not configured" }, { status: 500 });
  }

  const supabase = supabaseAdmin();

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

  const payload: DashboardStatsPayload = {
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
