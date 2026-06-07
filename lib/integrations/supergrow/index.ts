import { registerPlugin } from "@/lib/integrations/registry";
import type { IntegrationPlugin, IntegrationTool } from "@/lib/integrations/types";
import { getMcpConfig, withMcp, type McpCall } from "@/lib/integrations/mcp";
import { resolveWorkspaceId } from "./workspace";
import {
  composeAnalytics,
  metricTotal,
  normalizePosts,
  rankPostsByImpressions,
  toSupergrowPeriod,
  type SupergrowAnalytics,
} from "./normalize";

const SUPERGROW_API_BASE = "https://api.supergrow.ai/v1";

function isEnabled(): boolean {
  return !!process.env.SUPERGROW_API_KEY || !!process.env.SUPERGROW_MCP_SERVER_URL;
}

// Short snapshot cache for the composed analytics overview (it costs ~6 MCP calls).
// Protects the 500/day Supergrow rate limit against Refresh spam / status pings.
const snapshots = new Map<string, { data: SupergrowAnalytics; at: number }>();
const SNAPSHOT_TTL_MS = 5 * 60 * 1000;

function asObj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

async function resolveAccountName(call: McpCall, workspaceId: string, accountId: string | null): Promise<string | null> {
  try {
    const res = asObj(await call("get_linkedin_accounts", { workspace_id: workspaceId }));
    const accounts = Array.isArray(res.linked_in_accounts) ? res.linked_in_accounts : [];
    const match = accountId
      ? accounts.find((a) => String(asObj(a).id) === accountId)
      : accounts[0];
    const name = asObj(match ?? accounts[0]).name;
    return typeof name === "string" ? name : null;
  } catch {
    return null;
  }
}

async function composeLinkedInAnalytics(call: McpCall, workspaceId: string, period: string): Promise<SupergrowAnalytics> {
  const cacheKey = `${workspaceId}:${period}`;
  const hit = snapshots.get(cacheKey);
  if (hit && Date.now() - hit.at < SNAPSHOT_TTL_MS) return hit.data;

  const followersJson = await call("get_followers", { workspace_id: workspaceId, period });
  const impressionsJson = await call("get_metrics", { workspace_id: workspaceId, metric: "IMPRESSION", period });
  const reactions = metricTotal(await call("get_metrics", { workspace_id: workspaceId, metric: "REACTION", period }));
  const comments = metricTotal(await call("get_metrics", { workspace_id: workspaceId, metric: "COMMENT", period }));
  const reshares = metricTotal(await call("get_metrics", { workspace_id: workspaceId, metric: "RESHARE", period }));

  const accountId =
    typeof asObj(asObj(asObj(followersJson).trend).meta).account_id === "string"
      ? (asObj(asObj(asObj(followersJson).trend).meta).account_id as string)
      : null;
  const accountName = await resolveAccountName(call, workspaceId, accountId);

  const data = composeAnalytics({
    workspaceId,
    period,
    followersJson,
    impressionsJson,
    reactions,
    comments,
    reshares,
    accountName,
  });
  snapshots.set(cacheKey, { data, at: Date.now() });
  return data;
}

async function callMcp(name: string, params: Record<string, unknown>, call: McpCall): Promise<unknown> {
  const workspaceId = await resolveWorkspaceId(call);
  switch (name) {
    case "get_linkedin_analytics": {
      const period = toSupergrowPeriod(params.period);
      return composeLinkedInAnalytics(call, workspaceId, period);
    }
    case "get_post_performance": {
      const limit = typeof params.limit === "number" ? params.limit : 10;
      const json = await call("list_posts", { workspace_id: workspaceId, status: "published" });
      return { posts: rankPostsByImpressions(normalizePosts(json, 100), limit) };
    }
    case "list_scheduled_posts": {
      const limit = typeof params.limit === "number" ? params.limit : 10;
      const json = await call("list_posts", { workspace_id: workspaceId, status: "scheduled" });
      return { posts: normalizePosts(json, limit) };
    }
    case "schedule_post": {
      if (typeof params.content !== "string") throw new Error("content is required");
      if (typeof params.scheduled_at !== "string") throw new Error("scheduled_at is required");
      return call("schedule_post", {
        workspace_id: workspaceId,
        content: params.content,
        scheduled_at: params.scheduled_at,
        ...(typeof params.media_url === "string" && { media_url: params.media_url }),
      });
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// REST path retained for back-compat; Supergrow's primary mode is MCP.
async function supergrowFetch(path: string, opts?: RequestInit): Promise<unknown> {
  const apiKey = process.env.SUPERGROW_API_KEY;
  if (!apiKey) throw new Error("SUPERGROW_API_KEY is not configured");
  const res = await fetch(`${SUPERGROW_API_BASE}${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", ...(opts?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    throw new Error(`Supergrow API error: ${(body.message as string) ?? `HTTP ${res.status}`}`);
  }
  return res.json();
}

async function callRest(name: string, params: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case "get_linkedin_analytics":
      return supergrowFetch(`/analytics/linkedin?period=${typeof params.period === "string" ? params.period : "30d"}`);
    case "get_post_performance":
      return supergrowFetch(`/posts/performance?limit=${typeof params.limit === "number" ? params.limit : 10}`);
    case "list_scheduled_posts":
      return supergrowFetch(`/posts/scheduled?limit=${typeof params.limit === "number" ? params.limit : 10}`);
    case "schedule_post":
      if (typeof params.content !== "string" || typeof params.scheduled_at !== "string")
        throw new Error("content and scheduled_at are required");
      return supergrowFetch("/posts/schedule", {
        method: "POST",
        body: JSON.stringify({
          content: params.content,
          scheduled_at: params.scheduled_at,
          ...(typeof params.media_url === "string" && { media_url: params.media_url }),
        }),
      });
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

async function callTool(
  name: string,
  params: Record<string, unknown>,
  _ctx?: import("@/lib/integrations/types").IntegrationToolContext
): Promise<unknown> {
  // Supergrow auth is the query-param api_key in SUPERGROW_MCP_SERVER_URL; no
  // per-workspace OAuth, so ctx is currently unused.
  void _ctx;
  if (!isEnabled()) throw new Error("Supergrow is not configured (set SUPERGROW_MCP_SERVER_URL or SUPERGROW_API_KEY)");
  const mcp = getMcpConfig("supergrow");
  if (mcp) return withMcp(mcp, (call) => callMcp(name, params, call));
  return callRest(name, params);
}

const tools: IntegrationTool[] = [
  {
    name: "get_linkedin_analytics",
    description: "Get a LinkedIn analytics overview: follower count + growth, impressions (total/avg/trend), and engagement (reactions, comments, reshares, rate).",
    inputSchema: {
      type: "object",
      properties: { period: { type: "string", description: "Time period: 7d or 30d (default 30d)" } },
      required: [],
    },
  },
  {
    name: "get_post_performance",
    description: "Get recent LinkedIn posts ranked by impressions, with reactions, comments, and reshares.",
    inputSchema: {
      type: "object",
      properties: { limit: { type: "number", description: "Number of posts to return (default 10)" } },
      required: [],
    },
  },
  {
    name: "list_scheduled_posts",
    description: "List upcoming scheduled LinkedIn posts with their content preview and scheduled time.",
    inputSchema: {
      type: "object",
      properties: { limit: { type: "number", description: "Number of posts to return (default 10)" } },
      required: [],
    },
  },
  {
    name: "schedule_post",
    description: "Schedule a LinkedIn post for a future date and time.",
    inputSchema: {
      type: "object",
      properties: {
        content: { type: "string", description: "The post text content" },
        scheduled_at: { type: "string", description: "ISO 8601 datetime for when to publish" },
        media_url: { type: "string", description: "Optional media attachment URL" },
      },
      required: ["content", "scheduled_at"],
    },
  },
];

const SupergrowPlugin: IntegrationPlugin = {
  id: "supergrow",
  name: "Supergrow",
  description: "LinkedIn analytics, post performance, and scheduling via Supergrow (MCP).",
  features: ["analytics", "scheduling"],
  tools,
  callTool,
  isEnabled,
  analyticsConfig: {
    systemPrompt: `You are a LinkedIn analytics assistant with access to Supergrow data for The Identity Jedi LinkedIn presence.

Your job is to answer questions about LinkedIn performance by calling the available tools.

When asked for an analytics overview:
1. Call get_linkedin_analytics (period: 30d) for followers, impressions, and engagement.
2. Call get_post_performance (limit: 5) to identify top posts by impressions.
3. Summarize: follower count + growth, total impressions, engagement rate, top post, and any trends.

Return a structured summary. Lead with the most important numbers.`,
    defaultQueries: [
      "Give me a LinkedIn performance overview",
      "What are my top posts by impressions?",
      "How are my followers trending?",
      "Show me my scheduled posts",
    ],
  },
};

registerPlugin(SupergrowPlugin);

export default SupergrowPlugin;
