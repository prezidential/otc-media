import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { runAgent, type AgentRunState } from "@/lib/agents/framework";
import { createResearcherAgent } from "@/lib/agents/researcher";
import { createWriterAgent } from "@/lib/agents/writer";
import { createEditorAgent } from "@/lib/agents/editor";
import { saveAgentRun } from "@/lib/agents/persistence";

type PipelineStage = "researcher" | "writer" | "editor";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const stages = (body.stages as PipelineStage[] | undefined) ?? ["researcher", "writer", "editor"];
  const triggeredBy = (body.triggered_by as string) ?? "manual";

  const workspaceId = process.env.WORKSPACE_ID!;
  const supabase = supabaseAdmin();

  const { data: brandProfile } = await supabase
    .from("brand_profiles")
    .select("id")
    .eq("workspace_id", workspaceId)
    .limit(1)
    .maybeSingle();

  const brandProfileId = brandProfile?.id ?? "";

  const results: Record<string, { success: boolean; summary: string; decisions: string[]; data: Record<string, unknown> }> = {};
  let aborted = false;

  for (const stage of stages) {
    if (aborted) break;

    const startedAt = new Date().toISOString();
    let agent;

    if (stage === "researcher") {
      agent = createResearcherAgent(workspaceId);
    } else if (stage === "writer") {
      if (!brandProfileId) {
        results[stage] = { success: false, summary: "No brand profile found", decisions: [], data: {} };
        continue;
      }
      agent = createWriterAgent(workspaceId, brandProfileId);
    } else if (stage === "editor") {
      if (!brandProfileId) {
        results[stage] = { success: false, summary: "No brand profile found", decisions: [], data: {} };
        continue;
      }
      agent = createEditorAgent(workspaceId);
    } else {
      continue;
    }

    const context: Record<string, unknown> = {
      workspace_id: workspaceId,
      triggered_by: triggeredBy,
      brand_profile_id: brandProfileId,
    };

    const result = await runAgent(agent, context);

    results[stage] = {
      success: result.success,
      summary: result.summary,
      decisions: result.decisions,
      data: result.data,
    };

    const runState: AgentRunState = {
      agent_id: agent.id,
      workspace_id: workspaceId,
      run_id: crypto.randomUUID(),
      status: result.success ? "completed" : "failed",
      context: result.data,
      decisions: result.decisions,
      output_summary: result.summary,
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      triggered_by: triggeredBy,
    };

    await saveAgentRun(runState);

    if (!result.success) {
      aborted = true;
    }
  }

  const allSuccess = Object.values(results).every((r) => r.success);

  return NextResponse.json({
    ok: allSuccess,
    stages: results,
    aborted,
  });
}
