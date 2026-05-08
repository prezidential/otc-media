import { NextResponse } from "next/server";
import { getPlugin } from "@/lib/integrations/registry";

import "@/lib/integrations/beehiiv";
import "@/lib/integrations/supergrow";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ platform: string }> }
) {
  const { platform } = await params;
  const plugin = getPlugin(platform);

  if (!plugin) {
    return NextResponse.json({ ok: false, error: `Integration "${platform}" not found` }, { status: 404 });
  }

  if (!plugin.isEnabled()) {
    return NextResponse.json({ ok: false, enabled: false, error: "Integration not configured — check required environment variables" });
  }

  // Ping the first tool (lightest call) to verify connectivity
  const probeTool = plugin.tools[0];
  try {
    await plugin.callTool(probeTool.name, {});
    return NextResponse.json({ ok: true, enabled: true, tool: probeTool.name });
  } catch (err) {
    return NextResponse.json(
      { ok: false, enabled: true, error: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
  }
}
