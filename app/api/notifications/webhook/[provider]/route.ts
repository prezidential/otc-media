import { NextResponse } from "next/server";
import { opsLog } from "@/lib/ops/log";

/**
 * Deprecated single-tenant webhook endpoint (Phase 2A M2).
 *
 * Was `POST /api/notifications/webhook/[provider]` and resolved the workspace
 * via `process.env.WORKSPACE_ID`. That env var is gone. Each workspace now
 * registers its own webhook URL at
 *   `POST /api/notifications/webhook/[provider]/[workspaceId]`
 * (see `[workspaceId]/route.ts`). Operators must re-register the webhook in
 * the upstream provider (e.g. Telegram `setWebhook`) with the new path.
 *
 * Returns 410 Gone so misconfigured webhooks fail loudly instead of silently
 * dropping approvals into the wrong workspace.
 */
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ provider: string }> }
): Promise<NextResponse> {
  const { provider } = await ctx.params;
  opsLog("notification_webhook.deprecated_path_called", { provider }, "warn");
  return NextResponse.json(
    {
      ok: false,
      error:
        "This webhook URL is deprecated. Re-register the webhook to include your workspace id in the path: /api/notifications/webhook/" +
        provider +
        "/<workspaceId>.",
    },
    { status: 410 }
  );
}
