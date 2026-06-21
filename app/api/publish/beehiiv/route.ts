import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/auth/session";
import { runPublisher, type PublisherFailureCode } from "@/lib/agents/publisher";
import { saveAgentRun } from "@/lib/agents/persistence";
import type { AgentRunState } from "@/lib/agents/framework";

const STATUS_BY_CODE: Record<PublisherFailureCode, number> = {
  disabled: 403,
  not_found: 404,
  no_content: 400,
  publish_failed: 500,
};

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const draftId = (body.draftId ?? body.id) as string | undefined;
  const triggeredBy = (body.triggered_by as string) ?? "manual";

  if (!draftId) {
    return NextResponse.json({ error: "draftId required" }, { status: 400 });
  }

  const ctx = await requireWorkspace();
  if (ctx instanceof Response) return ctx;
  const { supabase, workspaceId, userId } = ctx;
  const origin = new URL(req.url).origin;

  const startedAt = new Date().toISOString();
  const result = await runPublisher({ workspaceId, supabase, draftId, userId, origin });

  // Persist the Publisher stage to the runs dashboard (completes the
  // Researcher → Writer → Editor → Publisher chain shown in /runs).
  if (result.loggable) {
    const runState: AgentRunState = {
      agent_id: "publisher",
      workspace_id: workspaceId,
      run_id: crypto.randomUUID(),
      status: result.ok ? "completed" : "failed",
      context: { draft_id: draftId, ...(result.ok ? { beehiiv: result.beehiiv } : {}) },
      decisions: result.decisions,
      output_summary: result.summary,
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      triggered_by: triggeredBy,
    };
    await saveAgentRun(runState);
  }

  if (!result.ok) {
    const status = STATUS_BY_CODE[result.code];
    // Preserve legacy response shapes: pre-flight errors use { error },
    // publish failures use { ok: false, error }.
    if (result.code === "publish_failed") {
      return NextResponse.json({ ok: false, error: result.error }, { status });
    }
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({
    ok: true,
    // Additive fields (action / paywallReminder) extend the legacy shape without
    // changing it — the Issues publish button still reads `ok` + `beehiiv.web_url`.
    action: result.action,
    ...(result.paywallReminder ? { paywallReminder: result.paywallReminder } : {}),
    beehiiv: {
      id: result.beehiiv.id,
      title: result.beehiiv.title,
      status: result.beehiiv.status,
      web_url: result.beehiiv.web_url,
    },
  });
}
