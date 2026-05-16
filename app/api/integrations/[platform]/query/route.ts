import { NextResponse } from "next/server";
import { runIntegrationQuery } from "@/lib/integrations/agent";
import { requireWorkspace } from "@/lib/auth/session";

/**
 * POST /api/integrations/[platform]/query
 *
 * Runs an integration plugin's analytics agent against the active workspace.
 *
 * Migration note (Phase 2A M2): the `workspaceId` formerly came from
 * `process.env.WORKSPACE_ID`. It now comes from the authenticated session via
 * `requireWorkspace()` so multi-tenant deployments scope queries correctly.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ platform: string }> }
) {
  const { platform } = await params;

  const ctx = await requireWorkspace();
  if (ctx instanceof Response) return ctx;
  const { workspaceId } = ctx;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const query = typeof body.query === "string" ? body.query.trim() : "";
  if (!query) {
    return NextResponse.json({ error: "query is required" }, { status: 400 });
  }

  const result = await runIntegrationQuery(platform, query, workspaceId);

  if (!result.ok) {
    return NextResponse.json(result, { status: result.error?.includes("not found") ? 404 : 400 });
  }

  return NextResponse.json(result);
}
