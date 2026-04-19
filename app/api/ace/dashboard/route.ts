import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getLaneBalance } from "@/lib/ace/lane-balance";

export async function GET() {
  const workspaceId = process.env.WORKSPACE_ID;
  if (!workspaceId) {
    return NextResponse.json({ error: "WORKSPACE_ID not configured" }, { status: 500 });
  }

  const supabase = supabaseAdmin();

  const [{ data: lastRun }, { data: pending }, { data: history }, laneBalance] = await Promise.all([
    supabase
      .from("ace_runs")
      .select("id, status, summary, error, started_at, completed_at, run_trigger, draft_id, approval_id")
      .eq("workspace_id", workspaceId)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("notification_approvals")
      .select("id, entity_type, entity_id, status, preview_text, sent_at, expires_at")
      .eq("workspace_id", workspaceId)
      .eq("status", "pending")
      .order("sent_at", { ascending: false }),
    supabase
      .from("ace_runs")
      .select("id, status, summary, error, started_at, completed_at, run_trigger")
      .eq("workspace_id", workspaceId)
      .order("started_at", { ascending: false })
      .limit(10),
    getLaneBalance(workspaceId),
  ]);

  return NextResponse.json({
    aceEnabled: process.env.ACE_ENABLED === "true",
    lastRun: lastRun ?? null,
    pendingApprovals: pending ?? [],
    history: history ?? [],
    laneBalance,
  });
}
