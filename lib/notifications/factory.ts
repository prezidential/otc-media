import type { NotificationProvider } from "./provider";
import { TelegramProvider } from "./providers/telegram";

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigurationError";
  }
}

export type WorkspaceNotificationConfig = {
  provider: "telegram" | "slack" | "email" | "sms";
  config: Record<string, string>;
};

export function getNotificationProvider(workspaceConfig?: WorkspaceNotificationConfig): NotificationProvider {
  if (!workspaceConfig) {
    return getProviderFromEnv();
  }
  switch (workspaceConfig.provider) {
    case "telegram": {
      const botToken = workspaceConfig.config.botToken ?? "";
      const chatId = workspaceConfig.config.chatId ?? "";
      const webhookSecret = workspaceConfig.config.webhookSecret ?? "";
      if (!botToken || !chatId || !webhookSecret) {
        throw new ConfigurationError("Telegram workspace config requires botToken, chatId, webhookSecret");
      }
      return new TelegramProvider({ botToken, chatId, webhookSecret });
    }
    default:
      throw new ConfigurationError(`Unsupported notification provider: ${workspaceConfig.provider}`);
  }
}

export function getProviderFromEnv(): NotificationProvider {
  const provider = (process.env.NOTIFICATION_PROVIDER ?? "telegram").toLowerCase();
  if (provider !== "telegram") {
    throw new ConfigurationError(`NOTIFICATION_PROVIDER "${provider}" is not supported in Phase 1`);
  }
  const botToken = process.env.TELEGRAM_BOT_TOKEN ?? "";
  const chatId = process.env.TELEGRAM_CHAT_ID ?? "";
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET ?? "";
  if (!botToken || !chatId || !webhookSecret) {
    throw new ConfigurationError(
      "Telegram requires TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, and TELEGRAM_WEBHOOK_SECRET"
    );
  }
  return new TelegramProvider({ botToken, chatId, webhookSecret });
}
