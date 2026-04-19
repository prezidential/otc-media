import { describe, it, expect, beforeEach, vi } from "vitest";
import { TelegramProvider } from "@/lib/notifications/providers/telegram";

describe("TelegramProvider", () => {
  const cfg = { botToken: "BOT", chatId: "99", webhookSecret: "whsec" };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("sendApprovalRequest posts inline keyboard with approve callback", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, result: { message_id: 42 } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const p = new TelegramProvider(cfg);
    await p.sendApprovalRequest({
      approvalId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      entityType: "newsletter_draft",
      entityId: "bbbbbbbb-cccc-dddd-eeee-ffffffffffff",
      headline: "Newsletter Draft Ready",
      previewLines: ["Hook one", "Hook two", "Thesis"],
      channel: "Test Channel",
      contentLane: "IAM Core",
    });

    expect(fetchMock).toHaveBeenCalled();
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.reply_markup.inline_keyboard[0][0].callback_data).toContain("approve:");
  });

  it("handleInbound rejects wrong secret token", async () => {
    const p = new TelegramProvider(cfg);
    await expect(
      p.handleInbound({ callback_query: { id: "1", data: "approve:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" } }, {})
    ).rejects.toThrow(/secret/i);
  });

  it("handleInbound parses approve callback_data", async () => {
    const p = new TelegramProvider(cfg);
    const id = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) })
    );
    const res = await p.handleInbound(
      { callback_query: { id: "cq", data: `approve:${id}`, message: { message_id: 7 } } },
      { "x-telegram-bot-api-secret-token": "whsec" }
    );
    expect(res?.approvalId).toBe(id);
    expect(res?.decision).toBe("approved");
  });

  it("sendStatusUpdate prefixes emoji by level", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, result: {} }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const p = new TelegramProvider(cfg);
    await p.sendStatusUpdate({ level: "error", title: "Oops", body: "detail" });
    const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body.text).toMatch(/^🚨/);
  });
});
