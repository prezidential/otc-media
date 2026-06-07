import { describe, it, expect, vi, beforeEach } from "vitest";

const { getConnMock, upsertMock } = vi.hoisted(() => ({
  getConnMock: vi.fn(),
  upsertMock: vi.fn().mockResolvedValue({ ok: true, id: "1" }),
}));

vi.mock("@/lib/integrations/beehiiv/store", () => ({
  getBeehiivConnection: getConnMock,
  upsertBeehiivConnection: upsertMock,
}));
// Avoid importing the supabase server module (and its env) for this unit.
vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: () => ({}) }));

import { getBeehiivAccessToken } from "@/lib/integrations/beehiiv/oauth";

const baseCtx = { workspaceId: "ws", userId: "u", supabase: {} as never };

beforeEach(() => vi.clearAllMocks());

describe("getBeehiivAccessToken", () => {
  it("returns null when there is no connection", async () => {
    getConnMock.mockResolvedValue(null);
    expect(await getBeehiivAccessToken(baseCtx)).toBeNull();
  });

  it("returns the stored token when not near expiry (no refresh)", async () => {
    getConnMock.mockResolvedValue({
      provider_user_id: "pub_x",
      access_token: "fresh-token",
      refresh_token: "r",
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
      scope: "read",
      profile_json: {},
    });
    expect(await getBeehiivAccessToken(baseCtx)).toBe("fresh-token");
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("returns the existing token (no refresh) when expired but no refresh_token", async () => {
    getConnMock.mockResolvedValue({
      provider_user_id: "pub_x",
      access_token: "stale-token",
      refresh_token: null,
      expires_at: new Date(Date.now() - 1000).toISOString(),
      scope: "read",
      profile_json: {},
    });
    expect(await getBeehiivAccessToken(baseCtx)).toBe("stale-token");
  });
});
