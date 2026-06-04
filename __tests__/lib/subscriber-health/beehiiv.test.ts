import { describe, it, expect, vi, afterEach } from "vitest";
import {
  analyzeSubscriptions,
  averageRates,
  beehiivGet,
  extractPublicationStats,
  extractPostRates,
} from "@/lib/subscriber-health/beehiiv";

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

  it("counts boost-sourced by 'boost' in utm_source or referral_code (case-insensitive)", () => {
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

  it("supports unix-seconds `created` field", () => {
    const result = analyzeSubscriptions([{ created: Math.floor((now - 1000) / 1000) }], now);
    expect(result.weeklyNewSubs).toBe(1);
  });
});

describe("Stats + post-rate extraction", () => {
  it("extracts paid subscribers and churn (percent normalized)", () => {
    const out = extractPublicationStats({
      data: { total_active_subscriptions: 1000, paid_subscriptions: 30, churn_rate: 0.04 },
    });
    expect(out.paidSubscribers).toBe(30);
    expect(out.monthlyChurnRate).toBeCloseTo(4);
  });

  it("normalizes fractional open/click rates to percent and averages them", () => {
    const a = extractPostRates({ data: { stats: { email: { open_rate: 0.6, click_rate: 0.02 } } } });
    const b = extractPostRates({ data: { stats: { email: { open_rate: 0.7, click_rate: 0.04 } } } });
    expect(a.openRate).toBeCloseTo(60);
    const avg = averageRates([a, b]);
    expect(avg.openRate).toBeCloseTo(65);
    expect(avg.clickRate).toBeCloseTo(3);
  });

  it("averageRates returns zero for empty input", () => {
    expect(averageRates([])).toEqual({ openRate: 0, clickRate: 0 });
  });
});

describe("beehiivGet error handling", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("throws with endpoint + status when API returns non-200", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({}) })
    );
    await expect(beehiivGet("/publications/pub_1/stats", "key")).rejects.toThrow(
      "Beehiiv API /publications/pub_1/stats failed: HTTP 503"
    );
  });

  it("returns parsed JSON on success with the bearer header set", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: 1 }) });
    vi.stubGlobal("fetch", fetchMock);
    const out = await beehiivGet("/publications/pub_1/stats", "secret");
    expect(out).toEqual({ data: 1 });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.beehiiv.com/v2/publications/pub_1/stats",
      { headers: { Authorization: "Bearer secret" } }
    );
  });
});
