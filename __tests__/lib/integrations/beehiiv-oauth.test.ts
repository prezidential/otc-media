import { describe, it, expect, vi, beforeEach } from "vitest";

const { getConnMock, getConnByWsMock, upsertMock } = vi.hoisted(() => ({
  getConnMock: vi.fn(),
  getConnByWsMock: vi.fn(),
  upsertMock: vi.fn().mockResolvedValue({ ok: true, id: "1" }),
}));

vi.mock("@/lib/integrations/beehiiv/store", () => ({
  getBeehiivConnection: getConnMock,
  getBeehiivConnectionByWorkspace: getConnByWsMock,
  upsertBeehiivConnection: upsertMock,
}));
// Avoid importing the supabase server module (and its env) for this unit.
vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: () => ({}) }));

import {
  getBeehiivAccessToken,
  getBeehiivAccessTokenForWorkspace,
} from "@/lib/integrations/beehiiv/oauth";

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

describe("getBeehiivAccessTokenForWorkspace", () => {
  const wsCtx = { workspaceId: "ws", supabase: {} as never };

  it("returns null when the workspace has no connection", async () => {
    getConnByWsMock.mockResolvedValue(null);
    expect(await getBeehiivAccessTokenForWorkspace(wsCtx)).toBeNull();
  });

  it("returns a fresh workspace token without refreshing", async () => {
    getConnByWsMock.mockResolvedValue({
      provider_user_id: "pub_x",
      access_token: "fresh-token",
      refresh_token: "r",
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
      scope: "read",
      profile_json: {},
    });
    expect(await getBeehiivAccessTokenForWorkspace(wsCtx)).toBe("fresh-token");
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("returns null (graceful fallback) when a stale token cannot be refreshed", async () => {
    // No real OAuth server in the unit env, so refresh throws and is swallowed.
    getConnByWsMock.mockResolvedValue({
      provider_user_id: "pub_x",
      access_token: "stale-token",
      refresh_token: "r",
      expires_at: new Date(Date.now() - 1000).toISOString(),
      scope: "read",
      profile_json: {},
    });
    expect(await getBeehiivAccessTokenForWorkspace(wsCtx)).toBeNull();
  });
});
