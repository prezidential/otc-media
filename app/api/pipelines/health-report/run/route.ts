import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/auth/session";
import { runSubscriberHealth } from "@/lib/subscriber-health/run";

/**
 * POST /api/pipelines/health-report/run
 *
 * User-initiated manual run (the "Run now" button on /integrations/analytics).
 * Authenticated via the Supabase session; the workspace is resolved from
 * `requireWorkspace()`, so it only ever runs the report for the caller's active
 * workspace. The scheduled/batch path lives in `../route.ts` (CRON_SECRET-guarded).
 */
export async function POST(): Promise<Response> {
  const ctx = await requireWorkspace();
  if (ctx instanceof Response) return ctx;

  const result = await runSubscriberHealth({ workspaceId: ctx.workspaceId, trigger: "manual" });
  return NextResponse.json(result);
}
