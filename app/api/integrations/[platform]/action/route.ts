import { NextResponse } from "next/server";
import { callIntegrationTool } from "@/lib/integrations/agent";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ platform: string }> }
) {
  const { platform } = await params;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const tool = typeof body.tool === "string" ? body.tool.trim() : "";
  const toolParams = (body.params as Record<string, unknown>) ?? {};

  if (!tool) {
    return NextResponse.json({ error: "tool is required" }, { status: 400 });
  }

  const result = await callIntegrationTool(platform, tool, toolParams);

  if (!result.ok) {
    return NextResponse.json(result, { status: result.error?.includes("not found") ? 404 : 400 });
  }

  return NextResponse.json(result);
}
