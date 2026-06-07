import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mcpConfigWithToken } from "@/lib/integrations/mcp";

beforeEach(() => vi.unstubAllEnvs());
afterEach(() => vi.unstubAllEnvs());

describe("mcpConfigWithToken", () => {
  it("returns null when the platform MCP server URL is not configured", () => {
    vi.stubEnv("BEEHIIV_MCP_SERVER_URL", "");
    expect(mcpConfigWithToken("beehiiv", "tok")).toBeNull();
  });

  it("overrides the Authorization header with the provided bearer token", () => {
    vi.stubEnv("BEEHIIV_MCP_SERVER_URL", "https://mcp.beehiiv.com/mcp");
    vi.stubEnv("BEEHIIV_API_KEY", "static-key");

    const cfg = mcpConfigWithToken("beehiiv", "oauth-tok");

    expect(cfg).not.toBeNull();
    expect(cfg!.url).toBe("https://mcp.beehiiv.com/mcp");
    expect(cfg!.headers.Authorization).toBe("Bearer oauth-tok");
  });
});
