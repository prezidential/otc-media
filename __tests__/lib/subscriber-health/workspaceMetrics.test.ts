import { describe, it, expect, vi, beforeEach } from "vitest";

// Avoid importing the supabase server module (and its env) when loading run.ts.
vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: () => ({}) }));

const { tokenMock } = vi.hoisted(() => ({ tokenMock: vi.fn() }));
vi.mock("@/lib/integrations/beehiiv/oauth", () => ({
  getBeehiivAccessTokenForWorkspace: tokenMock,
}));

const { isMcpEnabledMock, mcpConfigWithTokenMock } = vi.hoisted(() => ({
  isMcpEnabledMock: vi.fn(),
  mcpConfigWithTokenMock: vi.fn(),
}));
vi.mock("@/lib/integrations/mcp", () => ({
  isMcpEnabled: isMcpEnabledMock,
  mcpConfigWithToken: mcpConfigWithTokenMock,
}));

const { gatherEnvMock, gatherMcpMock } = vi.hoisted(() => ({
  gatherEnvMock: vi.fn(),
  gatherMcpMock: vi.fn(),
}));
vi.mock("@/lib/subscriber-health/beehiiv", () => ({
  gatherBeehiivMetrics: gatherEnvMock,
  gatherBeehiivMetricsMcp: gatherMcpMock,
}));

import { gatherWorkspaceBeehiivMetrics } from "@/lib/subscriber-health/run";

const beehiiv = { apiKey: "static-key", publicationId: "pub_1" };
const SAMPLE = {
  weeklyNewSubs: 1,
  linkedInSourcedPercent: 0,
  boostSourcedPercent: 0,
  monthlyChurnRate: 0,
  openRate: 0,
  clickRate: 0,
  paidSubscribers: 0,
};
const CONFIG = { url: "u", headers: { Authorization: "Bearer oauth-tok" }, transport: "auto" as const };

beforeEach(() => vi.clearAllMocks());

describe("gatherWorkspaceBeehiivMetrics", () => {
  it("routes through the workspace OAuth token when one is available", async () => {
    isMcpEnabledMock.mockReturnValue(true);
    tokenMock.mockResolvedValue("oauth-tok");
    mcpConfigWithTokenMock.mockReturnValue(CONFIG);
    gatherMcpMock.mockResolvedValue(SAMPLE);

    const out = await gatherWorkspaceBeehiivMetrics("ws-1", {} as never, beehiiv);

    expect(out).toBe(SAMPLE);
    expect(mcpConfigWithTokenMock).toHaveBeenCalledWith("beehiiv", "oauth-tok");
    expect(gatherMcpMock).toHaveBeenCalledWith(CONFIG, "pub_1");
    expect(gatherEnvMock).not.toHaveBeenCalled();
  });

  it("falls back to env credentials when there is no workspace OAuth token", async () => {
    isMcpEnabledMock.mockReturnValue(true);
    tokenMock.mockResolvedValue(null);
    gatherEnvMock.mockResolvedValue(SAMPLE);

    const out = await gatherWorkspaceBeehiivMetrics("ws-1", {} as never, beehiiv);

    expect(out).toBe(SAMPLE);
    expect(gatherEnvMock).toHaveBeenCalledWith("static-key", "pub_1");
    expect(gatherMcpMock).not.toHaveBeenCalled();
  });

  it("does not attempt a token lookup when MCP is disabled", async () => {
    isMcpEnabledMock.mockReturnValue(false);
    gatherEnvMock.mockResolvedValue(SAMPLE);

    const out = await gatherWorkspaceBeehiivMetrics("ws-1", {} as never, beehiiv);

    expect(out).toBe(SAMPLE);
    expect(tokenMock).not.toHaveBeenCalled();
    expect(gatherEnvMock).toHaveBeenCalledWith("static-key", "pub_1");
  });
});
