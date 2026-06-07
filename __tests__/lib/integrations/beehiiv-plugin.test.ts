import { describe, it, expect, vi, beforeEach } from "vitest";

const { getMcpConfigMock, withMcpMock } = vi.hoisted(() => ({
  getMcpConfigMock: vi.fn(),
  withMcpMock: vi.fn(),
}));

vi.mock("@/lib/integrations/mcp", () => ({
  getMcpConfig: getMcpConfigMock,
  withMcp: withMcpMock,
}));

import BeehiivPlugin from "@/lib/integrations/beehiiv";

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("Beehiiv plugin — MCP routing", () => {
  it("get_publication_stats injects publication_id and returns normalized stats", async () => {
    vi.stubEnv("BEEHIIV_PUBLICATION_ID", "pub_x");
    getMcpConfigMock.mockReturnValue({ url: "x", headers: {}, transport: "auto" });
    const call = vi.fn(async (name: string) => {
      if (name === "get_publication_stats")
        return { current_active_subscribers: 513, last_4_weeks: { open_rate: 64.35, click_rate: 1.42, net_subscribers: -116, earnings: "$15.61" } };
      return {};
    });
    withMcpMock.mockImplementation((_cfg: unknown, fn: (c: typeof call) => unknown) => fn(call));

    const res = (await BeehiivPlugin.callTool("get_publication_stats", {})) as Record<string, number>;
    expect(res).toMatchObject({ activeSubscribers: 513, openRate: 64.35, clickRate: 1.42, netSubscribers: -116 });
    expect(call).toHaveBeenCalledWith("get_publication_stats", expect.objectContaining({ publication_id: "pub_x" }));
  });

  it("list_posts maps 'confirmed' -> 'published' and merges per-post stats", async () => {
    vi.stubEnv("BEEHIIV_PUBLICATION_ID", "pub_x");
    getMcpConfigMock.mockReturnValue({ url: "x", headers: {}, transport: "auto" });
    const call = vi.fn(async (name: string) => {
      if (name === "list_posts") return { posts: [{ id: "p1", title: "Hello", status: "published" }] };
      if (name === "get_post_stats") return { email: { open_rate: 60, click_rate: 2 } };
      return {};
    });
    withMcpMock.mockImplementation((_cfg: unknown, fn: (c: typeof call) => unknown) => fn(call));

    const res = (await BeehiivPlugin.callTool("list_posts", { limit: 5, status: "confirmed" })) as { posts: Array<Record<string, unknown>> };
    expect(res.posts[0]).toMatchObject({ id: "p1", title: "Hello", openRate: 60, clickRate: 2 });
    expect(call).toHaveBeenCalledWith("list_posts", expect.objectContaining({ status: "published", publication_id: "pub_x" }));
  });
});

describe("Beehiiv plugin — REST fallback", () => {
  it("returns the same normalized shape via REST when no MCP config", async () => {
    getMcpConfigMock.mockReturnValue(null);
    vi.stubEnv("BEEHIIV_API_KEY", "key");
    vi.stubEnv("BEEHIIV_PUBLICATION_ID", "pub_x");
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: { total_active_subscriptions: 500, average_open_rate: 0.6, average_click_rate: 0.01 } }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const res = (await BeehiivPlugin.callTool("get_publication_stats", {})) as Record<string, number>;
    expect(res.activeSubscribers).toBe(500);
    expect(res.openRate).toBeCloseTo(60);
    expect(fetchMock).toHaveBeenCalled();
  });
});
