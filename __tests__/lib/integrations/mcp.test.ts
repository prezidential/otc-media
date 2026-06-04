import { describe, it, expect, beforeEach, vi } from "vitest";
import { getMcpConfig, isMcpEnabled, parseToolResult } from "@/lib/integrations/mcp";

beforeEach(() => {
  vi.unstubAllEnvs();
});

describe("getMcpConfig", () => {
  it("returns null when no server URL is set", () => {
    expect(getMcpConfig("beehiiv")).toBeNull();
    expect(isMcpEnabled("beehiiv")).toBe(false);
  });

  it("defaults auth to Bearer of the platform API key", () => {
    vi.stubEnv("BEEHIIV_MCP_SERVER_URL", "https://mcp.beehiiv.test/v1");
    vi.stubEnv("BEEHIIV_API_KEY", "rest-key");
    const cfg = getMcpConfig("beehiiv");
    expect(cfg).toEqual({
      url: "https://mcp.beehiiv.test/v1",
      headers: { Authorization: "Bearer rest-key" },
      transport: "auto",
    });
    expect(isMcpEnabled("beehiiv")).toBe(true);
  });

  it("prefers a dedicated MCP token over the API key", () => {
    vi.stubEnv("SUPERGROW_MCP_SERVER_URL", "https://mcp.supergrow.test");
    vi.stubEnv("SUPERGROW_API_KEY", "api");
    vi.stubEnv("SUPERGROW_MCP_TOKEN", "mcp-token");
    expect(getMcpConfig("supergrow")?.headers).toEqual({ Authorization: "Bearer mcp-token" });
  });

  it("sends the raw token under a custom auth header", () => {
    vi.stubEnv("BEEHIIV_MCP_SERVER_URL", "https://mcp.test");
    vi.stubEnv("BEEHIIV_MCP_TOKEN", "abc123");
    vi.stubEnv("BEEHIIV_MCP_AUTH_HEADER", "X-Api-Key");
    expect(getMcpConfig("beehiiv")?.headers).toEqual({ "X-Api-Key": "abc123" });
  });

  it("merges extra headers from JSON and honors a transport override", () => {
    vi.stubEnv("BEEHIIV_MCP_SERVER_URL", "https://mcp.test");
    vi.stubEnv("BEEHIIV_MCP_HEADERS", '{"X-Org":"acme"}');
    vi.stubEnv("BEEHIIV_MCP_TRANSPORT", "sse");
    const cfg = getMcpConfig("beehiiv");
    expect(cfg?.headers).toMatchObject({ "X-Org": "acme" });
    expect(cfg?.transport).toBe("sse");
  });

  it("ignores malformed MCP_HEADERS JSON", () => {
    vi.stubEnv("BEEHIIV_MCP_SERVER_URL", "https://mcp.test");
    vi.stubEnv("BEEHIIV_API_KEY", "k");
    vi.stubEnv("BEEHIIV_MCP_HEADERS", "{not json");
    expect(getMcpConfig("beehiiv")?.headers).toEqual({ Authorization: "Bearer k" });
  });
});

describe("parseToolResult", () => {
  it("parses JSON text content", () => {
    const out = parseToolResult({ content: [{ type: "text", text: '{"a":1}' }] });
    expect(out).toEqual({ a: 1 });
  });

  it("returns null for empty content", () => {
    expect(parseToolResult({ content: [] })).toBeNull();
    expect(parseToolResult({})).toBeNull();
  });

  it("returns the raw string when content is not JSON", () => {
    expect(parseToolResult({ content: [{ type: "text", text: "hello" }] })).toBe("hello");
  });

  it("throws when the tool result is flagged as an error", () => {
    expect(() => parseToolResult({ isError: true, content: [{ type: "text", text: "boom" }] })).toThrow(
      "MCP tool error: boom"
    );
  });
});
