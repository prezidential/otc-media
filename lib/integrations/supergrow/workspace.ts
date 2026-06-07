// lib/integrations/supergrow/workspace.ts
//
// Every Supergrow MCP tool requires a workspace_id. Resolve it once from
// SUPERGROW_WORKSPACE_ID (preferred — zero extra calls), else fall back to the
// first workspace from list_workspaces(). Cached in memory to spare the 500/day
// rate limit when the env var isn't set.

import type { McpCall } from "@/lib/integrations/mcp";

const TTL_MS = 60 * 60 * 1000; // 1 hour
let cached: { id: string; at: number } | null = null;

export async function resolveWorkspaceId(call: McpCall): Promise<string> {
  const env = process.env.SUPERGROW_WORKSPACE_ID;
  if (env) return env;

  if (cached && Date.now() - cached.at < TTL_MS) return cached.id;

  const res = (await call("list_workspaces", {})) as { workspaces?: Array<{ id?: string }> };
  const id = res?.workspaces?.[0]?.id;
  if (!id) {
    throw new Error("Supergrow: no workspace found — set SUPERGROW_WORKSPACE_ID");
  }
  cached = { id, at: Date.now() };
  return id;
}

/** Test helper — clears the in-memory workspace cache. */
export function resetWorkspaceCache(): void {
  cached = null;
}
