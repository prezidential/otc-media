import { registerPlugin } from "@/lib/integrations/registry";
import type { IntegrationPlugin, IntegrationTool } from "@/lib/integrations/types";

function isEnabled(): boolean {
  return !!process.env.SUPERGROW_API_KEY;
}

function notConfigured(): never {
  throw new Error("SUPERGROW_API_KEY is not configured");
}

const SUPERGROW_API_BASE = "https://api.supergrow.ai/v1";

async function supergrowFetch(path: string, opts?: RequestInit): Promise<unknown> {
  const apiKey = process.env.SUPERGROW_API_KEY;
  if (!apiKey) notConfigured();

  const mcpUrl = process.env.SUPERGROW_MCP_SERVER_URL;
  if (mcpUrl) {
    // MCP SDK upgrade path: when Supergrow MCP server URL is confirmed and
    // @modelcontextprotocol/sdk is installed, route through it here.
    throw new Error("SUPERGROW_MCP_SERVER_URL is set but MCP SDK routing is not yet implemented — remove this env var to use REST mode");
  }

  const res = await fetch(`${SUPERGROW_API_BASE}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(opts?.headers ?? {}),
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as Record<string, unknown>;
    const msg = (body.message as string) ?? `HTTP ${res.status}`;
    throw new Error(`Supergrow API error: ${msg}`);
  }

  return res.json();
}

const tools: IntegrationTool[] = [
  {
    name: "get_linkedin_analytics",
    description: "Get LinkedIn analytics overview: total impressions, engagement rate, follower count, and profile views over a date range.",
    inputSchema: {
      type: "object",
      properties: {
        period: { type: "string", description: "Time period: 7d, 30d, 90d (default: 30d)" },
      },
      required: [],
    },
  },
  {
    name: "get_post_performance",
    description: "Get per-post LinkedIn metrics: impressions, reactions, comments, shares, and engagement rate for recent posts.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Number of posts to return (default: 10)" },
        period: { type: "string", description: "Time period: 7d, 30d, 90d (default: 30d)" },
      },
      required: [],
    },
  },
  {
    name: "list_scheduled_posts",
    description: "List upcoming scheduled LinkedIn posts with their scheduled time, content preview, and status.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Number of posts to return (default: 10)" },
      },
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
        scheduled_at: { type: "string", description: "ISO 8601 datetime string for when to publish" },
        media_url: { type: "string", description: "Optional media attachment URL" },
      },
      required: ["content", "scheduled_at"],
    },
  },
];

async function callTool(name: string, params: Record<string, unknown>): Promise<unknown> {
  if (!isEnabled()) notConfigured();

  switch (name) {
    case "get_linkedin_analytics": {
      const period = typeof params.period === "string" ? params.period : "30d";
      return supergrowFetch(`/analytics/linkedin?period=${period}`);
    }
    case "get_post_performance": {
      const limit = typeof params.limit === "number" ? params.limit : 10;
      const period = typeof params.period === "string" ? params.period : "30d";
      return supergrowFetch(`/posts/performance?limit=${limit}&period=${period}`);
    }
    case "list_scheduled_posts": {
      const limit = typeof params.limit === "number" ? params.limit : 10;
      return supergrowFetch(`/posts/scheduled?limit=${limit}`);
    }
    case "schedule_post": {
      if (typeof params.content !== "string") throw new Error("content is required");
      if (typeof params.scheduled_at !== "string") throw new Error("scheduled_at is required");
      return supergrowFetch("/posts/schedule", {
        method: "POST",
        body: JSON.stringify({
          content: params.content,
          scheduled_at: params.scheduled_at,
          ...(typeof params.media_url === "string" && { media_url: params.media_url }),
        }),
      });
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

const SupergrowPlugin: IntegrationPlugin = {
  id: "supergrow",
  name: "Supergrow",
  description: "LinkedIn analytics, post performance, and scheduling via Supergrow.",
  features: ["analytics", "scheduling"],
  tools,
  callTool,
  isEnabled,
  analyticsConfig: {
    systemPrompt: `You are a LinkedIn analytics assistant with access to Supergrow data for The Identity Jedi LinkedIn presence.

Your job is to answer questions about LinkedIn performance by calling the available tools.

When asked for an analytics overview:
1. Call get_linkedin_analytics (period: 30d) to get impressions, engagement rate, follower count
2. Call get_post_performance (limit: 5, period: 30d) to identify top posts
3. Summarize: total impressions, engagement rate, follower count, top post by impressions, and any trends

Return a structured summary. Lead with the most important numbers.`,
    defaultQueries: [
      "Give me a LinkedIn performance overview",
      "What are my top posts by impressions?",
      "What's my engagement rate trending?",
      "Show me my post schedule for this week",
    ],
  },
};

registerPlugin(SupergrowPlugin);

export default SupergrowPlugin;
