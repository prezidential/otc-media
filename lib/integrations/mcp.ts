// lib/integrations/mcp.ts
//
// Configuration-driven Model Context Protocol (MCP) client used to route integration
// data access through an official platform MCP server instead of its REST API.
//
// Each platform is enabled by setting `{PLATFORM}_MCP_SERVER_URL`. Auth and transport
// are configured via env so a new MCP server can be wired up without code changes:
//
//   {PLATFORM}_MCP_SERVER_URL   (required) e.g. https://mcp.beehiiv.com/v1
//   {PLATFORM}_MCP_TOKEN        bearer token; defaults to {PLATFORM}_API_KEY
//   {PLATFORM}_MCP_AUTH_HEADER  header name for the token (default: Authorization,
//                               sent as "Bearer <token>"; any other header sends the
//                               raw token value)
//   {PLATFORM}_MCP_HEADERS      optional JSON object of extra headers
//   {PLATFORM}_MCP_TRANSPORT    "auto" (default) | "http" | "sse"

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

export type McpTransportMode = "auto" | "http" | "sse";

export type McpConfig = {
  url: string;
  headers: Record<string, string>;
  transport: McpTransportMode;
};

/** A single MCP tool call within an open session. */
export type McpCall = (name: string, args: Record<string, unknown>) => Promise<unknown>;

const ENV = (key: string): string | undefined => {
  const v = process.env[key];
  return v && v.length > 0 ? v : undefined;
};

export function isMcpEnabled(platform: string): boolean {
  return !!ENV(`${platform.toUpperCase()}_MCP_SERVER_URL`);
}

/** Resolve the MCP config for a platform from env, or null when not configured. */
export function getMcpConfig(platform: string): McpConfig | null {
  const P = platform.toUpperCase();
  const url = ENV(`${P}_MCP_SERVER_URL`);
  if (!url) return null;

  const headers: Record<string, string> = {};
  const token = ENV(`${P}_MCP_TOKEN`) ?? ENV(`${P}_API_KEY`);
  if (token) {
    const headerName = ENV(`${P}_MCP_AUTH_HEADER`) ?? "Authorization";
    headers[headerName] =
      headerName.toLowerCase() === "authorization" ? `Bearer ${token}` : token;
  }

  const extra = ENV(`${P}_MCP_HEADERS`);
  if (extra) {
    try {
      const parsed = JSON.parse(extra) as Record<string, unknown>;
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v === "string") headers[k] = v;
      }
    } catch {
      // ignore malformed override; the base auth header still applies
    }
  }

  const transport = (ENV(`${P}_MCP_TRANSPORT`) as McpTransportMode) ?? "auto";
  return { url, headers, transport };
}

type ToolResult = { content?: Array<{ type: string; text?: string }>; isError?: boolean };

export function parseToolResult(result: unknown): unknown {
  const res = (result ?? {}) as ToolResult;
  const text = (res.content ?? [])
    .filter((c) => c.type === "text")
    .map((c) => c.text ?? "")
    .join("");
  if (res.isError) throw new Error(`MCP tool error: ${text || "unknown error"}`);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function connect(config: McpConfig): Promise<Client> {
  const client = new Client({ name: "cornerstone", version: "1.0.0" }, { capabilities: {} });
  const url = new URL(config.url);
  const requestInit: RequestInit = { headers: config.headers };

  const tryHttp = config.transport === "auto" || config.transport === "http";
  const trySse = config.transport === "auto" || config.transport === "sse";

  if (tryHttp) {
    try {
      await client.connect(new StreamableHTTPClientTransport(url, { requestInit }));
      return client;
    } catch (err) {
      if (!trySse) throw err;
      // fall through to SSE (older MCP servers)
    }
  }
  await client.connect(new SSEClientTransport(url, { requestInit }));
  return client;
}

/** Open one MCP session, run `fn` with a call helper, and always close the client. */
export async function withMcp<T>(
  config: McpConfig,
  fn: (call: McpCall) => Promise<T>
): Promise<T> {
  const client = await connect(config);
  try {
    const call: McpCall = async (name, args) =>
      parseToolResult(await client.callTool({ name, arguments: args }));
    return await fn(call);
  } finally {
    await client.close().catch(() => {});
  }
}

/** Convenience one-shot tool call (opens and closes a session). */
export async function callMcpTool(
  config: McpConfig,
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  return withMcp(config, (call) => call(name, args));
}
