import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/auth/session";
import { runSubscriberHealth } from "@/lib/subscriber-health/run";
import { getBeehiivAccessToken } from "@/lib/integrations/beehiiv/oauth";
import type { McpConfig, McpTransportMode } from "@/lib/integrations/mcp";

/**
 * POST /api/pipelines/health-report/run
 *
 * User-initiated manual run (the "Run now" button on /integrations/analytics).
 * Authenticated via the Supabase session; the workspace is resolved from
 * `requireWorkspace()`, so it only ever runs the report for the caller's active
 * workspace. The scheduled/batch path lives in `../route.ts` (CRON_SECRET-guarded).
 */
export async function POST(req: Request): Promise<Response> {
  const ctx = await requireWorkspace();
  if (ctx instanceof Response) return ctx;

  // Use the active workspace's Beehiiv OAuth token (same path as the Analytics
  // plugin) so the manual run authenticates correctly; falls back to env/REST.
  let beehiivMcp: McpConfig | undefined;
  const mcpUrl = process.env.BEEHIIV_MCP_SERVER_URL;
  if (mcpUrl) {
    const token = await getBeehiivAccessToken({
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      supabase: ctx.supabase,
      origin: new URL(req.url).origin,
    }).catch(() => null);
    if (token) {
      beehiivMcp = {
        url: mcpUrl,
        headers: { Authorization: `Bearer ${token}` },
        transport: (process.env.BEEHIIV_MCP_TRANSPORT as McpTransportMode) ?? "auto",
      };
    }
  }

  const result = await runSubscriberHealth({ workspaceId: ctx.workspaceId, trigger: "manual", beehiivMcp });
  return NextResponse.json(result);
}
