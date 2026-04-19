import { describe, it, expect, vi, beforeEach } from "vitest";

const { getNotificationProviderMock } = vi.hoisted(() => ({
  getNotificationProviderMock: vi.fn(),
}));
vi.mock("@/lib/notifications/factory", () => ({
  getNotificationProvider: getNotificationProviderMock,
}));

import { POST } from "@/app/api/notifications/webhook/[provider]/route";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("WORKSPACE_ID", "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
});

describe("POST /api/notifications/webhook/[provider]", () => {
  it("returns 401 when Telegram secret is invalid", async () => {
    getNotificationProviderMock.mockReturnValue({
      id: "telegram",
      handleInbound: vi.fn().mockRejectedValue(new Error("Invalid Telegram webhook secret")),
    });

    const res = await POST(
      new Request("http://localhost/api/notifications/webhook/telegram", {
        method: "POST",
        body: "{}",
      }),
      { params: Promise.resolve({ provider: "telegram" }) }
    );
    expect(res.status).toBe(401);
  });

  it("returns 200 ok for unsupported provider without calling Telegram", async () => {
    const res = await POST(
      new Request("http://localhost/api/notifications/webhook/slack", {
        method: "POST",
        body: "{}",
      }),
      { params: Promise.resolve({ provider: "slack" }) }
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
  });
});
