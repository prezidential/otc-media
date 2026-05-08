import { runAgent, type AgentTool } from "@/lib/agents/framework";
import type { IntegrationQueryResult } from "./types";
import { getPlugin } from "./registry";

// Side-effect imports to ensure all plugins are registered before any call
import "./beehiiv";
import "./supergrow";

export async function runIntegrationQuery(
  pluginId: string,
  query: string,
  workspaceId: string
): Promise<IntegrationQueryResult> {
  const plugin = getPlugin(pluginId);

  if (!plugin) {
    return { ok: false, summary: "", data: {}, decisions: [], error: `Integration "${pluginId}" not found` };
  }

  if (!plugin.isEnabled()) {
    return { ok: false, summary: "", data: {}, decisions: [], error: `Integration "${pluginId}" is not enabled — check required environment variables` };
  }

  const agentTools: AgentTool[] = plugin.tools.map((t) => ({
    name: t.name,
    description: t.description,
    execute: (params) => plugin.callTool(t.name, params),
  }));

  const result = await runAgent(
    {
      id: `integration:${pluginId}`,
      name: `${plugin.name} Integration Agent`,
      role: "integration",
      systemPrompt: plugin.analyticsConfig.systemPrompt,
      tools: agentTools,
      maxIterations: 8,
    },
    { query, workspaceId, platform: pluginId }
  );

  return {
    ok: result.success,
    summary: result.summary,
    data: result.data,
    decisions: result.decisions,
    error: result.error,
  };
}

export async function callIntegrationTool(
  pluginId: string,
  toolName: string,
  params: Record<string, unknown>
): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  const plugin = getPlugin(pluginId);

  if (!plugin) {
    return { ok: false, error: `Integration "${pluginId}" not found` };
  }

  if (!plugin.isEnabled()) {
    return { ok: false, error: `Integration "${pluginId}" is not enabled` };
  }

  const toolExists = plugin.tools.some((t) => t.name === toolName);
  if (!toolExists) {
    return { ok: false, error: `Tool "${toolName}" not found on plugin "${pluginId}"` };
  }

  try {
    const data = await plugin.callTool(toolName, params);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
