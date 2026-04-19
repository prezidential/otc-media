import type { ApprovalPayload, ApprovalResponse, NotificationProvider, StatusMessage } from "../provider";

const TG_API = "https://api.telegram.org";

type TelegramUpdate = {
  callback_query?: {
    id: string;
    data?: string;
    message?: { message_id: number; chat?: { id: number } };
  };
  message?: { text?: string; chat?: { id: number } };
};

function levelEmoji(level: StatusMessage["level"]): string {
  switch (level) {
    case "info":
      return "ℹ️";
    case "success":
      return "✅";
    case "warning":
      return "⚠️";
    case "error":
      return "🚨";
    default:
      return "";
  }
}

export class TelegramProvider implements NotificationProvider {
  readonly id = "telegram";

  constructor(
    private readonly cfg: {
      botToken: string;
      chatId: string;
      webhookSecret: string;
    }
  ) {}

  private async api<T>(method: string, body: Record<string, unknown>): Promise<T> {
    const res = await fetch(`${TG_API}/bot${this.cfg.botToken}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string };
    if (!res.ok || json.ok === false) {
      throw new Error(json.description || `Telegram API ${method} failed: HTTP ${res.status}`);
    }
    return json as T;
  }

  async sendApprovalRequest(payload: ApprovalPayload): Promise<{ messageRef: string }> {
    const laneLine = payload.contentLane ? `\n<b>Lane:</b> ${escapeHtml(payload.contentLane)}` : "";
    const lines = payload.previewLines.map((l) => escapeHtml(l)).join("\n");
    const text = `🗞️ <b>${escapeHtml(payload.headline)}</b>

<b>Channel:</b> ${escapeHtml(payload.channel)}${laneLine}

${lines}

Expires in 8 hours.`;

    const data = await this.api<{ result?: { message_id?: number } }>("sendMessage", {
      chat_id: this.cfg.chatId,
      text,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "✅ Approve", callback_data: `approve:${payload.approvalId}` },
            { text: "❌ Reject", callback_data: `reject:${payload.approvalId}` },
          ],
        ],
      },
    });
    const mid = data.result?.message_id;
    if (typeof mid !== "number") throw new Error("Telegram sendMessage returned no message_id");
    return { messageRef: String(mid) };
  }

  async sendStatusUpdate(message: StatusMessage): Promise<void> {
    const prefix = levelEmoji(message.level);
    const parts = [prefix, message.title, message.body].filter(Boolean);
    const text = parts.join("\n\n");
    await this.api("sendMessage", {
      chat_id: this.cfg.chatId,
      text,
    });
  }

  async handleInbound(body: unknown, headers: Record<string, string>): Promise<ApprovalResponse | null> {
    const secret = headers["x-telegram-bot-api-secret-token"] ?? headers["X-Telegram-Bot-Api-Secret-Token"];
    if (secret !== this.cfg.webhookSecret) {
      throw new Error("Invalid Telegram webhook secret");
    }

    const update = body as TelegramUpdate;
    const respondedAt = new Date().toISOString();

    if (update.callback_query?.data) {
      const parsed = parseCallbackData(update.callback_query.data);
      if (!parsed) return null;
      const { approvalId, decision } = parsed;
      await this.answerCallback(update.callback_query.id);
      const msg = update.callback_query.message;
      if (msg?.message_id) {
        const resultLabel = decision === "approved" ? "✅ Approved — publishing now" : "❌ Rejected";
        try {
          await this.api("editMessageText", {
            chat_id: this.cfg.chatId,
            message_id: msg.message_id,
            text: resultLabel,
            reply_markup: { inline_keyboard: [] },
          });
        } catch {
          // message may be too old to edit; ignore
        }
      }
      return { approvalId, decision, respondedAt };
    }

    const txt = update.message?.text?.trim();
    if (txt) {
      const mApprove = txt.match(/^\/approve_([a-f0-9-]{36})$/i);
      const mReject = txt.match(/^\/reject_([a-f0-9-]{36})$/i);
      if (mApprove?.[1]) {
        return { approvalId: mApprove[1], decision: "approved", respondedAt };
      }
      if (mReject?.[1]) {
        return { approvalId: mReject[1], decision: "rejected", respondedAt };
      }
    }

    return null;
  }

  private async answerCallback(callbackQueryId: string): Promise<void> {
    await this.api("answerCallbackQuery", { callback_query_id: callbackQueryId });
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function parseCallbackData(data: string): { approvalId: string; decision: "approved" | "rejected" } | null {
  const approve = data.match(/^approve:([a-f0-9-]{36})$/i);
  if (approve) return { approvalId: approve[1], decision: "approved" };
  const reject = data.match(/^reject:([a-f0-9-]{36})$/i);
  if (reject) return { approvalId: reject[1], decision: "rejected" };
  return null;
}
