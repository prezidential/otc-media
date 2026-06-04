import { NextResponse } from "next/server";
import { runSubscriberHealth, type SubscriberHealthResult } from "@/lib/subscriber-health/run";
import { supabaseAdmin } from "@/lib/supabase/server";
import { opsLog } from "@/lib/ops/log";

/**
 * GET|POST /api/pipelines/health-report
 *
 * Weekly Subscriber Health report trigger. Guarded by `Authorization: Bearer ${CRON_SECRET}`.
 *
 * Wired via Vercel Cron (`vercel.json`), which invokes the path with a GET and injects the
 * `Authorization: Bearer ${CRON_SECRET}` header automatically when `CRON_SECRET` is set in the
 * project. POST is also accepted for manual/curl runs, e.g.:
 *   curl -X POST https://<app>/api/pipelines/health-report -H "Authorization: Bearer $CRON_SECRET"
 *
 * No user session is present, so this reads the set of opted-in workspaces via
 * `supabaseAdmin()` (RLS-bypassing) and fans out one `runSubscriberHealth()` per workspace with
 * `workspace_settings.subscriber_health_enabled = true`.
 */
async function handler(req: Request): Promise<NextResponse> {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const supabase = supabaseAdmin();
  const { data: rows, error } = await supabase
    .from("workspace_settings")
    .select("workspace_id")
    .eq("subscriber_health_enabled", true);

  if (error) {
    opsLog("subscriber_health.cron.list_workspaces_failed", { error: error.message }, "error");
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const workspaces = (rows ?? [])
    .map((r) => (typeof r.workspace_id === "string" ? r.workspace_id : String(r.workspace_id)))
    .filter((id) => id.length > 0);

  if (workspaces.length === 0) {
    return NextResponse.json({
      ok: true,
      count: 0,
      results: [] as SubscriberHealthResult[],
    });
  }

  const results: SubscriberHealthResult[] = [];
  for (const workspaceId of workspaces) {
    try {
      results.push(await runSubscriberHealth({ workspaceId, trigger: "cron" }));
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      opsLog("subscriber_health.cron.workspace_failed", { workspaceId, error: message }, "error");
      results.push({ workspaceId, status: "failed", summary: message, error: message });
    }
  }

  return NextResponse.json({ ok: true, count: results.length, results });
}

export async function GET(req: Request): Promise<NextResponse> {
  return handler(req);
}

export async function POST(req: Request): Promise<NextResponse> {
  return handler(req);
}
