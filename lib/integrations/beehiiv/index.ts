import { registerPlugin } from "@/lib/integrations/registry";
import type { IntegrationPlugin, IntegrationTool, IntegrationToolContext } from "@/lib/integrations/types";
import { getMcpConfig, withMcp, type McpCall, type McpConfig, type McpTransportMode } from "@/lib/integrations/mcp";
import { getBeehiivAccessToken } from "./oauth";
import {
  normalizePublicationStatsMcp,
  normalizePublicationStatsRest,
  normalizePostsMcp,
  normalizePostsRest,
  extractPostRatesMcp,
  extractPostRatesRest,
  type PostRates,
} from "./normalize";

const BEEHIIV_API_BASE = "https://api.beehiiv.com/v2";

// MCP `get_publication_stats` time_period for the overview (the response nests the
// period metrics under a key with this exact name). "last_4_weeks" ≈ a monthly view.
const STATS_PERIOD = "last_4_weeks";

function isEnabled(): boolean {
  return (
    (!!process.env.BEEHIIV_API_KEY && !!process.env.BEEHIIV_PUBLICATION_ID) ||
    (!!process.env.BEEHIIV_MCP_SERVER_URL && !!process.env.BEEHIIV_PUBLICATION_ID)
  );
}

/** Beehiiv REST status values (draft/confirmed/archived) -> MCP (draft/scheduled/published/archived). */
function toMcpStatus(status: unknown): string | undefined {
  if (typeof status !== "string") return undefined;
  if (status === "confirmed") return "published";
  return status;
}

function clamp(v: unknown, fallback: number, max: number): number {
  return typeof v === "number" ? Math.min(v, max) : fallback;
}

function asObj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

// ---------------------------------------------------------------------------
// REST fetch (default when no MCP server URL is configured)
// ---------------------------------------------------------------------------
async function beehiivFetch(path: string, params?: Record<string, string>): Promise<unknown> {
  const apiKey = process.env.BEEHIIV_API_KEY;
  const pubId = process.env.BEEHIIV_PUBLICATION_ID;
  if (!apiKey || !pubId) throw new Error("BEEHIIV_API_KEY and BEEHIIV_PUBLICATION_ID are required");

  const url = new URL(`${BEEHIIV_API_BASE}${path.replace("{pubId}", pubId)}`);
  if (params) for (const [k, v] of Object.entries(params)) url.searchParams.append(k, v);

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const msg = (body.errors as { message: string }[])?.[0]?.message ?? body.message ?? `HTTP ${res.status}`;
    throw new Error(`Beehiiv API error: ${msg}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// MCP path — routes through the official Beehiiv MCP server. Returns the SAME
// normalized shapes as the REST path so callers don't care which is active.
// ---------------------------------------------------------------------------
async function callMcp(name: string, params: Record<string, unknown>, call: McpCall, pubId: string): Promise<unknown> {
  switch (name) {
    case "get_publication_stats": {
      const json = await call("get_publication_stats", { publication_id: pubId, time_period: STATS_PERIOD });
      return normalizePublicationStatsMcp(json, STATS_PERIOD);
    }
    case "list_posts": {
      const limit = clamp(params.limit, 10, 50);
      const status = toMcpStatus(params.status) ?? "published";
      const res = asObj(
        await call("list_posts", { publication_id: pubId, status, per_page: limit, order_by: "newest_first" })
      );
      const posts = Array.isArray(res.posts) ? (res.posts as unknown[]) : [];
      const ids = posts
        .map((p) => asObj(p).id)
        .filter((id): id is string => typeof id === "string")
        .slice(0, limit);
      const ratesById: Record<string, PostRates> = {};
      for (const id of ids) {
        ratesById[id] = extractPostRatesMcp(await call("get_post_stats", { post_id: id }));
      }
      return { posts: normalizePostsMcp(posts, ratesById) };
    }
    case "get_post_stats": {
      if (typeof params.post_id !== "string") throw new Error("post_id is required");
      return extractPostRatesMcp(await call("get_post_stats", { post_id: params.post_id }));
    }
    case "list_subscriptions": {
      const limit = clamp(params.limit, 20, 100);
      const status = typeof params.status === "string" ? params.status : "active";
      return call("list_subscriptions", { publication_id: pubId, status, per_page: limit });
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ---------------------------------------------------------------------------
// REST path — same normalized output shapes as the MCP path.
// ---------------------------------------------------------------------------
async function callRest(name: string, params: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case "get_publication_stats":
      return normalizePublicationStatsRest(await beehiivFetch("/publications/{pubId}/stats"));
    case "list_posts": {
      const qp: Record<string, string> = {
        limit: String(clamp(params.limit, 10, 50)),
        "expand[]": "stats",
      };
      if (typeof params.status === "string") qp.status = params.status;
      return { posts: normalizePostsRest(await beehiivFetch("/publications/{pubId}/posts", qp)) };
    }
    case "get_post_stats": {
      if (typeof params.post_id !== "string") throw new Error("post_id is required");
      return extractPostRatesRest(await beehiivFetch(`/publications/{pubId}/posts/${params.post_id}/stats`));
    }
    case "list_subscriptions": {
      const qp: Record<string, string> = { limit: String(clamp(params.limit, 20, 100)) };
      if (typeof params.status === "string") qp.status = params.status;
      return beehiivFetch("/publications/{pubId}/subscriptions", qp);
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

async function callTool(
  name: string,
  params: Record<string, unknown>,
  ctx?: IntegrationToolContext
): Promise<unknown> {
  const pubId = process.env.BEEHIIV_PUBLICATION_ID;
  const mcpUrl = process.env.BEEHIIV_MCP_SERVER_URL;

  // 1) Per-workspace OAuth token (preferred when connected) → MCP.
  if (ctx && mcpUrl) {
    const token = await getBeehiivAccessToken({
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      supabase: ctx.supabase,
      origin: ctx.origin,
    }).catch(() => null);
    if (token) {
      if (!pubId) throw new Error("BEEHIIV_PUBLICATION_ID is required");
      const cfg: McpConfig = {
        url: mcpUrl,
        headers: { Authorization: `Bearer ${token}` },
        transport: (process.env.BEEHIIV_MCP_TRANSPORT as McpTransportMode) ?? "auto",
      };
      return withMcp(cfg, (call) => callMcp(name, params, call, pubId));
    }
  }

  // 2) Static env token (BEEHIIV_MCP_TOKEN / BEEHIIV_API_KEY) → MCP.
  const mcp = getMcpConfig("beehiiv");
  if (mcp) {
    if (!pubId) throw new Error("BEEHIIV_PUBLICATION_ID is required");
    return withMcp(mcp, (call) => callMcp(name, params, call, pubId));
  }
  return callRest(name, params);
}

const tools: IntegrationTool[] = [
  {
    name: "get_publication_stats",
    description: "Get publication statistics: active subscribers, new/churned/net subscribers, open and click rate, and earnings for the recent period.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "list_posts",
    description: "List recent newsletter posts with title, status, open rate, and click rate. Optionally filter by status.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max posts to return (default 10, max 50)" },
        status: { type: "string", description: "Filter by status: confirmed/published, draft, archived" },
      },
      required: [],
    },
  },
  {
    name: "get_post_stats",
    description: "Get open and click rate for a specific post by its post ID.",
    inputSchema: {
      type: "object",
      properties: { post_id: { type: "string", description: "The post ID" } },
      required: ["post_id"],
    },
  },
  {
    name: "list_subscriptions",
    description: "List subscribers with status, tier, and acquisition source. Useful for audience and growth analysis.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max subscribers to return (default 20, max 100)" },
        status: { type: "string", description: "Filter by status: active, inactive, pending" },
      },
      required: [],
    },
  },
];

const BeehiivPlugin: IntegrationPlugin = {
  id: "beehiiv",
  name: "Beehiiv",
  description: "Newsletter analytics, subscriber data, and post performance from Beehiiv (MCP with REST fallback).",
  features: ["analytics", "audience", "publishing"],
  tools,
  callTool,
  isEnabled,
  analyticsConfig: {
    systemPrompt: `You are a newsletter analytics assistant with access to Beehiiv data for The Identity Jedi newsletter.

Your job is to answer questions about newsletter performance by calling the available tools.

When asked for an analytics overview or performance summary:
1. Call get_publication_stats for active subscribers, new/churned/net subscribers, open rate, click rate, and earnings.
2. Call list_posts (limit 5) to get recent posts.
3. Identify the top performer by open rate and click rate.
4. Summarize: subscriber count and net change, open/click rate, top post headline + open rate, and any notable trends.

Return a structured summary. Be concise — lead with the most important numbers.`,
    defaultQueries: [
      "Give me a full performance overview",
      "What are my top posts by open rate?",
      "How is my subscriber count trending?",
      "Show me recent post engagement",
    ],
  },
};

registerPlugin(BeehiivPlugin);

export default BeehiivPlugin;
