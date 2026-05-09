import { NextResponse } from "next/server";
import { listPlugins } from "@/lib/integrations/registry";

// Side-effect: registers all plugins
import "@/lib/integrations/beehiiv";
import "@/lib/integrations/supergrow";

export async function GET() {
  const integrations = listPlugins();
  return NextResponse.json({ integrations });
}
