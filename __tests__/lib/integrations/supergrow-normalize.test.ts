import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  normalizeFollowers,
  normalizeImpressions,
  metricTotal,
  composeAnalytics,
  normalizePosts,
  rankPostsByImpressions,
  toSupergrowPeriod,
} from "@/lib/integrations/supergrow/normalize";
import { resolveWorkspaceId, resetWorkspaceCache } from "@/lib/integrations/supergrow/workspace";

describe("supergrow normalize", () => {
  it("normalizeFollowers maps count, summary, and profile meta", () => {
    const json = {
      current_count: 6754,
      trend: {
        data: [{ date: "2026-06-05", follower_count: 6754, change: 2 }],
        summary: { total_change: 274, total_change_percentage: 4.23, average_daily_change: 9.2 },
        meta: { profile_url: "https://linkedin.com/in/identityjedi", account_id: "acc1" },
      },
    };
    const { followers, profile } = normalizeFollowers(json);
    expect(followers.current).toBe(6754);
    expect(followers.totalChange).toBe(274);
    expect(profile.profileUrl).toContain("identityjedi");
    expect(profile.accountId).toBe("acc1");
  });

  it("normalizeImpressions maps summary + series", () => {
    const json = {
      data: [{ date: "2026-05-13", impression_count: 17799 }],
      summary: { total_count: 96070, average_daily: 3202.33, peak_day: { date: "2026-05-13" }, trend_direction: "decreasing", period_change: -2646 },
    };
    const imp = normalizeImpressions(json);
    expect(imp.total).toBe(96070);
    expect(imp.peakDay).toBe("2026-05-13");
    expect(imp.series[0]).toEqual({ date: "2026-05-13", value: 17799 });
  });

  it("metricTotal pulls summary.total_count", () => {
    expect(metricTotal({ summary: { total_count: 42 } })).toBe(42);
    expect(metricTotal({})).toBe(0);
  });

  it("composeAnalytics computes engagement rate and guards divide-by-zero", () => {
    const followersJson = { current_count: 100, trend: { data: [], summary: {}, meta: { account_id: "a" } } };
    const withImpressions = composeAnalytics({
      workspaceId: "w", period: "last_30_days", followersJson,
      impressionsJson: { summary: { total_count: 1000 } }, reactions: 30, comments: 15, reshares: 5, accountName: "David Lee",
    });
    expect(withImpressions.engagement.rate).toBeCloseTo(5); // (30+15+5)/1000*100
    expect(withImpressions.profile.name).toBe("David Lee");

    const zero = composeAnalytics({
      workspaceId: "w", period: "last_30_days", followersJson,
      impressionsJson: { summary: { total_count: 0 } }, reactions: 5, comments: 5, reshares: 0,
    });
    expect(zero.engagement.rate).toBe(0); // no divide-by-zero
  });

  it("normalizePosts maps text/metrics and rankPostsByImpressions sorts desc", () => {
    const json = { posts: [
      { id: "1", text: "low", impressions_count: 100, likes_count: 1, comments_count: 0, reshares_count: 0, status: "published", published_at: "2026-06-01T00:00:00Z" },
      { id: "2", text: "high", impressions_count: 900, likes_count: 9, comments_count: 2, reshares_count: 1, status: "published", published_at: "2026-06-02T00:00:00Z" },
    ] };
    const posts = normalizePosts(json, 10);
    expect(posts[0].content).toBe("low");
    const ranked = rankPostsByImpressions(posts, 1);
    expect(ranked[0].id).toBe("2");
  });

  it("toSupergrowPeriod maps the UI vocabulary", () => {
    expect(toSupergrowPeriod("7d")).toBe("last_7_days");
    expect(toSupergrowPeriod("30d")).toBe("last_30_days");
    expect(toSupergrowPeriod(undefined)).toBe("last_30_days");
  });
});

describe("resolveWorkspaceId", () => {
  beforeEach(() => {
    resetWorkspaceCache();
    vi.unstubAllEnvs();
  });

  it("prefers SUPERGROW_WORKSPACE_ID without calling list_workspaces", async () => {
    vi.stubEnv("SUPERGROW_WORKSPACE_ID", "env-ws");
    const call = vi.fn();
    expect(await resolveWorkspaceId(call)).toBe("env-ws");
    expect(call).not.toHaveBeenCalled();
  });

  it("falls back to list_workspaces and caches the result", async () => {
    const call = vi.fn().mockResolvedValue({ workspaces: [{ id: "ws-from-list" }] });
    expect(await resolveWorkspaceId(call)).toBe("ws-from-list");
    expect(await resolveWorkspaceId(call)).toBe("ws-from-list"); // cached
    expect(call).toHaveBeenCalledTimes(1);
  });
});
