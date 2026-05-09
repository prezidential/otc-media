import { NextResponse } from "next/server";
import { getRegisteredPlugins } from "@/lib/integrations/registry";
import type { UnifiedAnalyticsPayload, PlatformAnalyticsSnapshot } from "@/lib/integrations/types";

// Side-effect: registers all plugins
import "@/lib/integrations/beehiiv";
import "@/lib/integrations/supergrow";

export async function GET() {
  const plugins = getRegisteredPlugins();
  const platforms: Record<string, PlatformAnalyticsSnapshot> = {};

  await Promise.all(
    plugins.map(async (plugin) => {
      if (!plugin.isEnabled()) {
        platforms[plugin.id] = { enabled: false, name: plugin.name };
        return;
      }

      // Each plugin has a canonical "overview" tool — call it for a quick snapshot.
      // For Beehiiv: get_publication_stats. For Supergrow: get_linkedin_analytics.
      const overviewTool = plugin.tools[0];
      try {
        const data = await plugin.callTool(overviewTool.name, {});
        platforms[plugin.id] = { enabled: true, name: plugin.name, data: data as Record<string, unknown> };
      } catch (err) {
        platforms[plugin.id] = {
          enabled: true,
          name: plugin.name,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    })
  );

  const payload: UnifiedAnalyticsPayload = {
    ok: true,
    fetchedAt: new Date().toISOString(),
    platforms,
  };

  return NextResponse.json(payload);
}
