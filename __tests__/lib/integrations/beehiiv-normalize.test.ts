import { describe, it, expect } from "vitest";
import {
  normalizePublicationStatsMcp,
  normalizePublicationStatsRest,
  normalizePostsMcp,
  normalizePostsRest,
  extractPostRatesMcp,
  extractPostRatesRest,
} from "@/lib/integrations/beehiiv/normalize";

describe("beehiiv normalize — publication stats", () => {
  it("maps the MCP shape (rates already percent, nested under the period key)", () => {
    const json = {
      current_active_subscribers: 513,
      last_4_weeks: {
        open_rate: 64.35,
        click_rate: 1.42,
        new_subscribers: 47,
        churned_subscribers: 163,
        net_subscribers: -116,
        earnings: "$15.61",
        acquisition_sources: [{ source: "website: linkedin.com / referral", count: 22 }],
      },
    };
    const r = normalizePublicationStatsMcp(json, "last_4_weeks");
    expect(r.activeSubscribers).toBe(513);
    expect(r.openRate).toBe(64.35); // stays percent
    expect(r.clickRate).toBe(1.42);
    expect(r.netSubscribers).toBe(-116);
    expect(r.earnings).toBeCloseTo(15.61); // "$15.61" -> 15.61
    expect(r.acquisitionSources[0]).toEqual({ source: "website: linkedin.com / referral", count: 22 });
  });

  it("maps the REST shape (rates 0–1 -> percent)", () => {
    const json = { data: { total_active_subscriptions: 500, average_open_rate: 0.6435, average_click_rate: 0.0142 } };
    const r = normalizePublicationStatsRest(json);
    expect(r.activeSubscribers).toBe(500);
    expect(r.openRate).toBeCloseTo(64.35);
    expect(r.clickRate).toBeCloseTo(1.42);
  });
});

describe("beehiiv normalize — posts", () => {
  it("MCP posts map title + merge per-post rates", () => {
    const posts = [{ id: "p1", title: "Hello", status: "published", scheduled_at: "2026-06-01T00:00:00Z" }];
    const out = normalizePostsMcp(posts, { p1: { openRate: 60, clickRate: 2 } });
    expect(out[0]).toMatchObject({ id: "p1", title: "Hello", openRate: 60, clickRate: 2, publishedAt: "2026-06-01T00:00:00Z" });
  });

  it("REST posts map subject->title and convert fraction rates", () => {
    const json = { data: [{ id: "p2", subject: "Subj", status: "confirmed", stats: { email: { open_rate: 0.5, click_rate: 0.03 } } }] };
    const out = normalizePostsRest(json);
    expect(out[0].title).toBe("Subj");
    expect(out[0].openRate).toBeCloseTo(50);
    expect(out[0].clickRate).toBeCloseTo(3);
  });

  it("post-rate extractors handle MCP (percent) vs REST (fraction)", () => {
    expect(extractPostRatesMcp({ email: { open_rate: 64, click_rate: 1.4 } })).toEqual({ openRate: 64, clickRate: 1.4 });
    const rest = extractPostRatesRest({ data: { stats: { email: { open_rate: 0.64, click_rate: 0.014 } } } });
    expect(rest.openRate).toBeCloseTo(64);
    expect(rest.clickRate).toBeCloseTo(1.4);
  });
});
