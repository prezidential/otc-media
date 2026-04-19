import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ConfigurationError, getProviderFromEnv, getNotificationProvider } from "@/lib/notifications/factory";

describe("notification factory", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("throws ConfigurationError when Telegram env is incomplete", () => {
    vi.stubEnv("NOTIFICATION_PROVIDER", "telegram");
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "");
    expect(() => getProviderFromEnv()).toThrow(ConfigurationError);
  });

  it("returns Telegram provider when env is valid", () => {
    vi.stubEnv("NOTIFICATION_PROVIDER", "telegram");
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "token");
    vi.stubEnv("TELEGRAM_CHAT_ID", "123");
    vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "secret");
    const p = getProviderFromEnv();
    expect(p.id).toBe("telegram");
  });

  it("throws when workspace telegram config is incomplete", () => {
    expect(() =>
      getNotificationProvider({
        provider: "telegram",
        config: { botToken: "x" },
      })
    ).toThrow(ConfigurationError);
  });
});
