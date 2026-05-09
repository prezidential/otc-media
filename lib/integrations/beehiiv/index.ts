import { registerPlugin, type IntegrationPlugin } from "@/lib/integrations/registry";
import type { IntegrationTool } from "@/lib/integrations/types";

const BEEHIIV_API_BASE = "https://api.beehiiv.com/v2";

function isEnabled(): boolean {
  return !!process.env.BEEHIIV_API_KEY && !!process.env.BEEHIIV_PUBLICATION_ID;
}

async function beehiivFetch(path: string, params?: Record<string, string>): Promise<unknown> {
  const apiKey = process.env.BEEHIIV_API_KEY;
  const pubId = process.env.BEEHIIV_PUBLICATION_ID;

  if (!apiKey || !pubId) throw new Error("BEEHIIV_API_KEY and BEEHIIV_PUBLICATION_ID are required");

  const mcpUrl = process.env.BEEHIIV_MCP_SERVER_URL;
  if (mcpUrl) {
    // MCP SDK upgrade path: when a real MCP server URL is configured, route through it.
    // Placeholder until @modelcontextprotocol/sdk is installed and the server URL is confirmed.
    throw new Error("BEEHIIV_MCP_SERVER_URL is set but MCP SDK routing is not yet implemented — remove this env var to use REST mode");
  }

  const url = new URL(`${BEEHIIV_API_BASE}${path.replace("{pubId}", pubId)}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as Record<string, unknown>;
    const msg = (body.errors as { message: string }[])?.[0]?.message ?? body.message ?? `HTTP ${res.status}`;
    throw new Error(`Beehiiv API error: ${msg}`);
  }

  return res.json();
}

const tools: IntegrationTool[] = [
  {
    name: "get_publication_stats",
    description: "Get overall publication statistics: total subscriber count, active subscribers, and growth metrics.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "list_posts",
    description: "List recent newsletter posts with their status, open rate, click rate, and subject lines. Optionally filter by status.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max posts to return (default 10, max 50)" },
        status: { type: "string", description: "Filter by status: draft, confirmed, archived" },
      },
      required: [],
    },
  },
  {
    name: "get_post_stats",
    description: "Get detailed engagement stats for a specific post by its post ID: opens, clicks, unsubscribes.",
    inputSchema: {
      type: "object",
      properties: {
        post_id: { type: "string", description: "The post ID to retrieve stats for" },
      },
      required: ["post_id"],
    },
  },
  {
    name: "list_subscriptions",
    description: "List subscribers with their status, tier, acquisition source, and created date. Useful for audience and growth analysis.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max subscribers to return (default 20)" },
        status: { type: "string", description: "Filter by status: active, inactive, pending" },
      },
      required: [],
    },
  },
];

async function callTool(name: string, params: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case "get_publication_stats": {
      return beehiivFetch("/publications/{pubId}/stats");
    }
    case "list_posts": {
      const limit = typeof params.limit === "number" ? String(Math.min(params.limit, 50)) : "10";
      const qp: Record<string, string> = { limit };
      if (typeof params.status === "string") qp.status = params.status;
      return beehiivFetch("/publications/{pubId}/posts", qp);
    }
    case "get_post_stats": {
      if (typeof params.post_id !== "string") throw new Error("post_id is required");
      return beehiivFetch(`/publications/{pubId}/posts/${params.post_id}/stats`);
    }
    case "list_subscriptions": {
      const limit = typeof params.limit === "number" ? String(Math.min(params.limit, 100)) : "20";
      const qp: Record<string, string> = { limit };
      if (typeof params.status === "string") qp.status = params.status;
      return beehiivFetch("/publications/{pubId}/subscriptions", qp);
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

const BeehiivPlugin: IntegrationPlugin = {
  id: "beehiiv",
  name: "Beehiiv",
  description: "Newsletter analytics, subscriber data, and post performance from Beehiiv.",
  features: ["analytics", "audience", "publishing"],
  tools,
  callTool,
  isEnabled,
  analyticsConfig: {
    systemPrompt: `You are a newsletter analytics assistant with access to Beehiiv data for The Identity Jedi newsletter.

Your job is to answer questions about newsletter performance by calling the available tools.

When asked for an analytics overview or performance summary:
1. Call get_publication_stats to get total and active subscriber counts
2. Call list_posts (limit 5, status "confirmed") to get recent published posts
3. Identify the top performer by open rate and click rate
4. Summarize: subscriber count, recent post count, top post headline + open rate, and any notable trends

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
