import { describe, it, expect, vi, beforeEach } from "vitest";

const { getMcpConfigMock, withMcpMock } = vi.hoisted(() => ({
  getMcpConfigMock: vi.fn(),
  withMcpMock: vi.fn(),
}));

vi.mock("@/lib/integrations/mcp", () => ({
  getMcpConfig: getMcpConfigMock,
  withMcp: withMcpMock,
}));

import SupergrowPlugin from "@/lib/integrations/supergrow";
import { resetWorkspaceCache } from "@/lib/integrations/supergrow/workspace";

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  resetWorkspaceCache();
});

describe("Supergrow plugin — MCP routing", () => {
  it("get_linkedin_analytics composes followers + impressions + engagement + profile name", async () => {
    vi.stubEnv("SUPERGROW_MCP_SERVER_URL", "https://mcp.supergrow.ai/mcp?api_key=k");
    vi.stubEnv("SUPERGROW_WORKSPACE_ID", "ws-analytics");
    getMcpConfigMock.mockReturnValue({ url: "x", headers: {}, transport: "auto" });

    const call = vi.fn(async (name: string, args: Record<string, unknown>) => {
      if (name === "get_followers")
        return { current_count: 6754, trend: { data: [], summary: { total_change: 274 }, meta: { account_id: "acc1" } } };
      if (name === "get_metrics") {
        if (args.metric === "IMPRESSION") return { data: [], summary: { total_count: 96070, average_daily: 3202, trend_direction: "decreasing" } };
        if (args.metric === "REACTION") return { summary: { total_count: 300 } };
        if (args.metric === "COMMENT") return { summary: { total_count: 100 } };
        if (args.metric === "RESHARE") return { summary: { total_count: 100 } };
      }
      if (name === "get_linkedin_accounts") return { linked_in_accounts: [{ id: "acc1", name: "David Lee" }] };
      return {};
    });
    withMcpMock.mockImplementation((_cfg: unknown, fn: (c: typeof call) => unknown) => fn(call));

    const res = (await SupergrowPlugin.callTool("get_linkedin_analytics", { period: "30d" })) as {
      followers: { current: number };
      impressions: { total: number };
      engagement: { rate: number };
      profile: { name: string | null };
    };
    expect(res.followers.current).toBe(6754);
    expect(res.impressions.total).toBe(96070);
    expect(res.engagement.rate).toBeCloseTo((500 / 96070) * 100, 3);
    expect(res.profile.name).toBe("David Lee");
    expect(call).toHaveBeenCalledWith("get_followers", expect.objectContaining({ workspace_id: "ws-analytics" }));
  });

  it("get_post_performance ranks posts by impressions", async () => {
    vi.stubEnv("SUPERGROW_MCP_SERVER_URL", "https://mcp.supergrow.ai/mcp?api_key=k");
    vi.stubEnv("SUPERGROW_WORKSPACE_ID", "ws-posts");
    getMcpConfigMock.mockReturnValue({ url: "x", headers: {}, transport: "auto" });
    const call = vi.fn(async (name: string) =>
      name === "list_posts"
        ? { posts: [
            { id: "a", text: "low", impressions_count: 10 },
            { id: "b", text: "high", impressions_count: 900 },
          ] }
        : {}
    );
    withMcpMock.mockImplementation((_cfg: unknown, fn: (c: typeof call) => unknown) => fn(call));

    const res = (await SupergrowPlugin.callTool("get_post_performance", { limit: 5 })) as { posts: Array<{ id: string }> };
    expect(res.posts[0].id).toBe("b");
  });

  it("throws when not configured", async () => {
    getMcpConfigMock.mockReturnValue(null);
    await expect(SupergrowPlugin.callTool("get_linkedin_analytics", {})).rejects.toThrow(/not configured/i);
  });
});
