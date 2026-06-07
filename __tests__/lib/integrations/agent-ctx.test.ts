import { describe, it, expect, vi, beforeEach } from "vitest";

const { getPluginMock } = vi.hoisted(() => ({ getPluginMock: vi.fn() }));

vi.mock("@/lib/integrations/registry", () => ({
  getPlugin: getPluginMock,
  registerPlugin: vi.fn(),
  getRegisteredPlugins: vi.fn(() => []),
}));

import { callIntegrationTool } from "@/lib/integrations/agent";

beforeEach(() => vi.clearAllMocks());

describe("integration agent — ctx threading", () => {
  it("passes the workspace ctx through callIntegrationTool to plugin.callTool", async () => {
    const callTool = vi.fn().mockResolvedValue({ ok: true });
    getPluginMock.mockReturnValue({
      id: "beehiiv",
      isEnabled: () => true,
      tools: [{ name: "get_publication_stats" }],
      callTool,
    });

    const ctx = { workspaceId: "ws", userId: "u", supabase: {} as never, origin: "https://app" };
    await callIntegrationTool("beehiiv", "get_publication_stats", { a: 1 }, ctx);

    expect(callTool).toHaveBeenCalledWith("get_publication_stats", { a: 1 }, ctx);
  });
});
