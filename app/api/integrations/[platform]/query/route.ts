import { NextResponse } from "next/server";
import { runIntegrationQuery } from "@/lib/integrations/agent";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ platform: string }> }
) {
  const { platform } = await params;
  const workspaceId = process.env.WORKSPACE_ID;

  if (!workspaceId) {
    return NextResponse.json({ error: "WORKSPACE_ID not configured" }, { status: 500 });
  }

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
