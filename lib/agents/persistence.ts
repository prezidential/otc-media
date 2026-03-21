import { supabaseAdmin } from "@/lib/supabase/server";
import type { AgentRunState } from "./framework";

export async function saveAgentRun(run: AgentRunState): Promise<void> {
  const supabase = supabaseAdmin();

  const { error } = await supabase.from("runs").insert({
    workspace_id: run.workspace_id,
    run_type: `agent:${run.agent_id}`,
    status: run.status === "completed" ? "completed" : run.status === "failed" ? "failed" : "initiated",
    input_refs_json: {
      agent_id: run.agent_id,
      triggered_by: run.triggered_by,
      context: run.context,
    },
    output_refs_json: {
      decisions: run.decisions,
      summary: run.output_summary,
    },
    ...(run.completed_at && { finished_at: run.completed_at }),
  });

  if (error && process.env.NODE_ENV !== "production") {
    console.warn(`[agent-run] Failed to save run for ${run.agent_id}:`, error.message);
  }
}
