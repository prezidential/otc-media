import { NextResponse } from "next/server";
import { runAce, type AceRunResult } from "@/lib/ace/orchestrator";
import { supabaseAdmin } from "@/lib/supabase/server";
import { opsLog } from "@/lib/ops/log";

/**
 * POST /api/ace/cron
 *
 * Triggered by Railway/Vercel cron with `Authorization: Bearer ${CRON_SECRET}`.
 * No user session is present, so this route reads the active set of workspaces
 * via `supabaseAdmin()` (RLS-bypassing) and fans out one `runAce()` call per
 * workspace with `workspace_settings.ace_enabled = true`.
 *
 * Migration note (Phase 2A M2): used to read `process.env.WORKSPACE_ID` and
 * `process.env.ACE_ENABLED` for a single-tenant deployment. The env-based
 * gates are gone; per-workspace opt-in lives on `workspace_settings.ace_enabled`
 * (see `lib/supabase/schema-workspace-settings.sql`).
 */
export async function POST(req: Request) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const supabase = supabaseAdmin();
  const { data: rows, error } = await supabase
    .from("workspace_settings")
    .select("workspace_id")
    .eq("ace_enabled", true);

  if (error) {
    opsLog("ace.cron.list_workspaces_failed", { error: error.message }, "error");
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const workspaces = (rows ?? [])
    .map((r) => (typeof r.workspace_id === "string" ? r.workspace_id : String(r.workspace_id)))
    .filter((id) => id.length > 0);

  if (workspaces.length === 0) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "no workspaces with ace_enabled=true",
      results: [] as Array<{ workspaceId: string; result: AceRunResult }>,
    });
  }

  const results: Array<{ workspaceId: string; result: AceRunResult }> = [];
  for (const workspaceId of workspaces) {
    try {
      const result = await runAce({ workspaceId, trigger: "cron" });
      results.push({ workspaceId, result });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      opsLog("ace.cron.workspace_failed", { workspaceId, error: message }, "error");
      results.push({
        workspaceId,
        result: {
          runId: "",
          status: "failed",
          summary: message,
          error: message,
        },
      });
    }
  }

  return NextResponse.json({ ok: true, count: results.length, results });
}
