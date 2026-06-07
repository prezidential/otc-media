import { describe, it, expect, vi, beforeEach } from "vitest";

const { getMcpConfigMock, withMcpMock, getTokenMock } = vi.hoisted(() => ({
  getMcpConfigMock: vi.fn(),
  withMcpMock: vi.fn(),
  getTokenMock: vi.fn(),
}));

vi.mock("@/lib/integrations/mcp", () => ({ getMcpConfig: getMcpConfigMock, withMcp: withMcpMock }));
vi.mock("@/lib/integrations/beehiiv/oauth", () => ({ getBeehiivAccessToken: getTokenMock }));

import BeehiivPlugin from "@/lib/integrations/beehiiv";

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("Beehiiv plugin — OAuth routing", () => {
  it("uses the per-workspace OAuth token to build a Bearer MCP config", async () => {
    vi.stubEnv("BEEHIIV_MCP_SERVER_URL", "https://mcp.beehiiv.com/mcp");
    vi.stubEnv("BEEHIIV_PUBLICATION_ID", "pub_x");
    getTokenMock.mockResolvedValue("oauth-tok");

    let capturedCfg: { headers?: Record<string, string> } = {};
    const call = vi.fn(async () => ({ current_active_subscribers: 7, last_4_weeks: {} }));
    withMcpMock.mockImplementation((cfg: typeof capturedCfg, fn: (c: typeof call) => unknown) => {
      capturedCfg = cfg;
      return fn(call);
    });

    const res = (await BeehiivPlugin.callTool("get_publication_stats", {}, {
      workspaceId: "ws",
      userId: "u",
      supabase: {} as never,
    })) as { activeSubscribers: number };

    expect(capturedCfg.headers?.Authorization).toBe("Bearer oauth-tok");
    expect(res.activeSubscribers).toBe(7);
    expect(getMcpConfigMock).not.toHaveBeenCalled(); // OAuth short-circuits the env path
  });

  it("falls back to the env MCP config when no ctx is provided", async () => {
    vi.stubEnv("BEEHIIV_PUBLICATION_ID", "pub_x");
    getMcpConfigMock.mockReturnValue({ url: "x", headers: {}, transport: "auto" });
    const call = vi.fn(async () => ({ current_active_subscribers: 1, last_4_weeks: {} }));
    withMcpMock.mockImplementation((_c: unknown, fn: (c: typeof call) => unknown) => fn(call));

    await BeehiivPlugin.callTool("get_publication_stats", {});
    expect(getMcpConfigMock).toHaveBeenCalled();
    expect(getTokenMock).not.toHaveBeenCalled();
  });
});
