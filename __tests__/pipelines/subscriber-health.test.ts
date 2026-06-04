import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "node:fs";

import {
  evalStandard,
  evalInverted,
  analyzeSubscriptions,
  loadHistory,
  updateHistory,
  formatReport,
  assertEnv,
  beehiivGet,
  getISOWeek,
  type KpiConfig,
  type KpiConfigMap,
  type KpiHistory,
  type ReportMetrics,
} from "@/pipelines/subscriber-health";

vi.mock("node:fs");

const KPIS: KpiConfigMap = {
  weeklyNewSubs: { target: 10, warn: 5 },
  linkedInSourcedPercent: { target: 70, warn: 40 },
  boostSourcedPercent: { target: 0, warn: 5 },
  monthlyChurnRate: { target: 3, warn: 6 },
  openRate: { target: 65, warn: 60 },
  clickRate: { target: 2, warn: 1 },
  paidSubscribers: { target: 25, warn: 13 },
};

function metric(value: number, status: "green" | "yellow" | "red", consecutiveWeeksBelow = 0) {
  return { value, status, consecutiveWeeksBelow };
}

// All-green baseline so individual tests only override what they care about.
function greenMetrics(): ReportMetrics {
  return {
    weeklyNewSubs: metric(12, "green"),
    linkedInSourcedPercent: metric(80, "green"),
    boostSourcedPercent: metric(0, "green"),
    monthlyChurnRate: metric(2, "green"),
    openRate: metric(70, "green"),
    clickRate: metric(3, "green"),
    paidSubscribers: metric(30, "green"),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("KPI evaluation", () => {
  const cfg: KpiConfig = { target: 10, warn: 5 };

  it("evalStandard: green when value >= target", () => {
    expect(evalStandard(10, cfg)).toBe("green");
    expect(evalStandard(15, cfg)).toBe("green");
  });

  it("evalStandard: yellow when warn <= value < target", () => {
    expect(evalStandard(5, cfg)).toBe("yellow");
    expect(evalStandard(9, cfg)).toBe("yellow");
  });

  it("evalStandard: red when value < warn", () => {
    expect(evalStandard(4, cfg)).toBe("red");
    expect(evalStandard(0, cfg)).toBe("red");
  });

  const inv: KpiConfig = { target: 3, warn: 6 };

  it("evalInverted: green when value <= target", () => {
    expect(evalInverted(3, inv)).toBe("green");
    expect(evalInverted(1, inv)).toBe("green");
  });

  it("evalInverted: yellow when target < value <= warn", () => {
    expect(evalInverted(4, inv)).toBe("yellow");
    expect(evalInverted(6, inv)).toBe("yellow");
  });

  it("evalInverted: red when value > warn", () => {
    expect(evalInverted(7, inv)).toBe("red");
    expect(evalInverted(20, inv)).toBe("red");
  });
});

describe("Subscription filtering", () => {
  const now = Date.UTC(2026, 5, 4, 12, 0, 0); // 2026-06-04T12:00:00Z
  const within = new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString();
  const old = new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString();

  it("counts only subscriptions within last 7 days", () => {
    const result = analyzeSubscriptions(
      [{ created_at: within }, { created_at: within }, { created_at: old }],
      now
    );
    expect(result.weeklyNewSubs).toBe(2);
  });

  it("counts LinkedIn-sourced by LI_ prefix on referral_code", () => {
    const result = analyzeSubscriptions(
      [
        { created_at: within, referral_code: "LI_abc" },
        { created_at: within, referral_code: "LI_xyz" },
        { created_at: within, referral_code: "ORG_123" },
        { created_at: within },
      ],
      now
    );
    expect(result.linkedInSourced).toBe(2);
    expect(result.linkedInSourcedPercent).toBe(50);
  });

  it("counts boost-sourced by 'boost' in utm_source or referral_code", () => {
    const result = analyzeSubscriptions(
      [
        { created_at: within, utm_source: "Boost-Network" },
        { created_at: within, referral_code: "summer_BOOST" },
        { created_at: within, utm_source: "organic" },
        { created_at: within, referral_code: "LI_abc" },
      ],
      now
    );
    expect(result.boostSourced).toBe(2);
    expect(result.boostSourcedPercent).toBe(50);
  });

  it("handles empty subscription list gracefully (no division by zero)", () => {
    const result = analyzeSubscriptions([], now);
    expect(result.weeklyNewSubs).toBe(0);
    expect(result.linkedInSourcedPercent).toBe(0);
    expect(result.boostSourcedPercent).toBe(0);
  });
});

describe("KPI history", () => {
  it("initializes empty history when file not found", () => {
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    });
    expect(loadHistory("/nope.json")).toEqual({});
  });

  it("increments consecutiveWeeksBelow when metric is red", () => {
    const history: KpiHistory = { openRate: { consecutiveWeeksBelow: 1, lastStatus: "red" } };
    const entry = updateHistory(history, "openRate", "red");
    expect(entry.consecutiveWeeksBelow).toBe(2);
    expect(entry.lastStatus).toBe("red");
  });

  it("resets consecutiveWeeksBelow to 0 when metric recovers", () => {
    const history: KpiHistory = { openRate: { consecutiveWeeksBelow: 4, lastStatus: "red" } };
    const entry = updateHistory(history, "openRate", "green");
    expect(entry.consecutiveWeeksBelow).toBe(0);
    expect(entry.lastStatus).toBe("green");
  });

  it("preserves other metric history when one metric changes", () => {
    const history: KpiHistory = {
      openRate: { consecutiveWeeksBelow: 2, lastStatus: "red" },
      clickRate: { consecutiveWeeksBelow: 5, lastStatus: "red" },
    };
    updateHistory(history, "openRate", "green");
    expect(history.clickRate).toEqual({ consecutiveWeeksBelow: 5, lastStatus: "red" });
  });
});

describe("Telegram message formatting", () => {
  const base = { date: "2026-06-04", weekNumber: 23, kpis: KPIS };

  it("includes all 3 sections: Growth, Retention, Monetization", () => {
    const msg = formatReport({ ...base, metrics: greenMetrics() });
    expect(msg).toContain("📈 Growth");
    expect(msg).toContain("💔 Retention");
    expect(msg).toContain("💰 Monetization");
  });

  it("shows correct status emoji per metric status", () => {
    const metrics = greenMetrics();
    metrics.openRate = metric(58, "yellow");
    metrics.clickRate = metric(0.5, "red");
    const msg = formatReport({ ...base, metrics });
    expect(msg).toMatch(/New subs \(7d\): 12 ✅/);
    expect(msg).toMatch(/Open rate \(last 3\): 58% 🟡/);
    expect(msg).toMatch(/Click rate \(last 3\): 0\.5% 🔴/);
  });

  it("appends consecutive-week warning when consecutiveWeeksBelow >= 3", () => {
    const metrics = greenMetrics();
    metrics.openRate = metric(40, "red", 3);
    const msg = formatReport({ ...base, metrics });
    expect(msg).toContain("⚠️ Open rate below warn threshold for 3 consecutive weeks");
  });

  it("does not append warning when consecutiveWeeksBelow < 3", () => {
    const metrics = greenMetrics();
    metrics.openRate = metric(40, "red", 2);
    const msg = formatReport({ ...base, metrics });
    expect(msg).not.toContain("consecutive weeks");
  });

  it("omits dashboard footer when CORNERSTONE_URL is not set", () => {
    const metrics = greenMetrics();
    metrics.clickRate = metric(0.5, "red"); // a red metric exists
    const msg = formatReport({ ...base, metrics });
    expect(msg).not.toContain("📌 Dashboard");
  });

  it("includes dashboard footer when a metric is red and CORNERSTONE_URL is set", () => {
    const metrics = greenMetrics();
    metrics.clickRate = metric(0.5, "red");
    const msg = formatReport({ ...base, metrics, cornerstoneUrl: "https://app.example.com" });
    expect(msg).toContain("📌 Dashboard: https://app.example.com/integrations/analytics");
  });
});

describe("ISO week number", () => {
  it("computes the ISO week containing the first Thursday", () => {
    expect(getISOWeek(new Date(Date.UTC(2026, 0, 1)))).toBe(1); // Thu 2026-01-01
    expect(getISOWeek(new Date(Date.UTC(2026, 5, 4)))).toBe(23);
  });
});

describe("Error handling", () => {
  it("throws descriptive error when BEEHIIV_API_KEY is missing", () => {
    expect(() =>
      assertEnv({
        BEEHIIV_PUBLICATION_ID: "pub_1",
        TELEGRAM_BOT_TOKEN: "tok",
        TELEGRAM_CHAT_ID: "chat",
      })
    ).toThrow(/BEEHIIV_API_KEY/);
  });

  it("throws with endpoint + status when API returns non-200", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({}) })
    );
    await expect(beehiivGet("/publications/pub_1/stats", "key")).rejects.toThrow(
      "Beehiiv API /publications/pub_1/stats failed: HTTP 503"
    );
    vi.unstubAllGlobals();
  });
});
