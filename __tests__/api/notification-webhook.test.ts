import { describe, it, expect, vi, beforeEach } from "vitest";

const { getNotificationProviderMock } = vi.hoisted(() => ({
  getNotificationProviderMock: vi.fn(),
}));
vi.mock("@/lib/notifications/factory", () => ({
  getNotificationProvider: getNotificationProviderMock,
}));

import { POST } from "@/app/api/notifications/webhook/[provider]/[workspaceId]/route";
import { POST as POST_LEGACY } from "@/app/api/notifications/webhook/[provider]/route";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/notifications/webhook/[provider]/[workspaceId]", () => {
  it("returns 401 when Telegram secret is invalid", async () => {
    getNotificationProviderMock.mockReturnValue({
      id: "telegram",
      handleInbound: vi.fn().mockRejectedValue(new Error("Invalid Telegram webhook secret")),
    });

    const res = await POST(
      new Request(
        "http://localhost/api/notifications/webhook/telegram/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        {
          method: "POST",
          body: "{}",
        }
      ),
      {
        params: Promise.resolve({
          provider: "telegram",
          workspaceId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        }),
      }
    );
    expect(res.status).toBe(401);
  });

  it("returns 200 ok for unsupported provider without calling Telegram", async () => {
    const res = await POST(
      new Request(
        "http://localhost/api/notifications/webhook/slack/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        {
          method: "POST",
          body: "{}",
        }
      ),
      {
        params: Promise.resolve({
          provider: "slack",
          workspaceId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        }),
      }
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
  });

  it("returns 400 when workspaceId path segment is empty", async () => {
    const res = await POST(
      new Request("http://localhost/api/notifications/webhook/telegram/", {
        method: "POST",
        body: "{}",
      }),
      { params: Promise.resolve({ provider: "telegram", workspaceId: "" }) }
    );
    expect(res.status).toBe(400);
  });
});

describe("POST /api/notifications/webhook/[provider] (legacy)", () => {
  it("returns 410 Gone with the migration message", async () => {
    const res = await POST_LEGACY(
      new Request("http://localhost/api/notifications/webhook/telegram", {
        method: "POST",
        body: "{}",
      }),
      { params: Promise.resolve({ provider: "telegram" }) }
    );
    expect(res.status).toBe(410);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error).toMatch(/deprecated/i);
    expect(json.error).toContain("/api/notifications/webhook/telegram/<workspaceId>");
  });
});
