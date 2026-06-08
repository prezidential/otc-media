import { describe, it, expect } from "vitest";
import {
  buildNudge,
  draftTitle,
  formatDayStamp,
  greetingParts,
  lastIngestStale,
  pickNeedsYou,
  summarizeHealth,
  type HealthRow,
} from "@/lib/dashboard/stats";

describe("dashboard stats helpers", () => {
  it("formatDayStamp returns uppercase weekday", () => {
    const s = formatDayStamp(new Date("2026-04-10T12:00:00Z"));
    expect(s).toMatch(/FRIDAY/);
  });

  it("pickNeedsYou prioritizes leads then issues", () => {
    expect(
      pickNeedsYou({ leadsPending: 2, issuesDraft: 1, staleResearch: true, outlinesCount: 3 })
    ).toBe("leads");
    expect(
      pickNeedsYou({ leadsPending: 0, issuesDraft: 1, staleResearch: true, outlinesCount: 3 })
    ).toBe("issues");
    expect(
      pickNeedsYou({ leadsPending: 0, issuesDraft: 0, staleResearch: true, outlinesCount: 3 })
    ).toBe("research");
    expect(
      pickNeedsYou({ leadsPending: 0, issuesDraft: 0, staleResearch: false, outlinesCount: 2 })
    ).toBe("outlines");
    expect(
      pickNeedsYou({ leadsPending: 0, issuesDraft: 0, staleResearch: false, outlinesCount: 0 })
    ).toBe(null);
  });

  it("lastIngestStale respects window", () => {
    const fresh = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    expect(lastIngestStale(fresh, null)).toBe(false);
    const old = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    expect(lastIngestStale(old, null)).toBe(true);
    expect(lastIngestStale(null, null)).toBe(true);
  });

  it("buildNudge surfaces lead backlog copy", () => {
    const n = buildNudge({
      leadsPending: 3,
      oldestPendingLeadDays: 2,
      issuesDraft: 0,
      staleResearch: false,
    });
    expect(n.accentFragment).toContain("3 leads");
    expect(n.primaryCta.href).toBe("/leads");
  });

  it("greetingParts returns time-appropriate greeting", () => {
    const g = greetingParts();
    expect(g.headline).toMatch(/Good (morning|afternoon|evening)\./);
    expect(g.accentPhrase).toBeTruthy();
  });

  it("summarizeHealth returns null when there is no history", () => {
    expect(summarizeHealth([])).toBeNull();
  });

  it("summarizeHealth counts statuses and surfaces the worst metric", () => {
    const rows: HealthRow[] = [
      { metric: "open_rate", last_status: "green", last_value: 64, updated_at: "2026-06-01T00:00:00Z" },
      { metric: "monthly_churn", last_status: "red", last_value: 26, updated_at: "2026-06-08T00:00:00Z" },
      { metric: "weekly_new_subs", last_status: "yellow", last_value: 4, updated_at: "2026-06-05T00:00:00Z" },
    ];
    const h = summarizeHealth(rows)!;
    expect(h.metrics).toBe(3);
    expect(h.green).toBe(1);
    expect(h.yellow).toBe(1);
    expect(h.red).toBe(1);
    // worst = the red metric; updatedAt = most recent across rows
    expect(h.worst).toEqual({ metric: "monthly_churn", status: "red", value: 26 });
    expect(h.updatedAt).toBe("2026-06-08T00:00:00Z");
  });

  it("summarizeHealth picks yellow as worst when there is no red", () => {
    const rows: HealthRow[] = [
      { metric: "open_rate", last_status: "green", last_value: 64, updated_at: "2026-06-01T00:00:00Z" },
      { metric: "click_rate", last_status: "yellow", last_value: 1.4, updated_at: "2026-06-02T00:00:00Z" },
    ];
    expect(summarizeHealth(rows)!.worst?.status).toBe("yellow");
  });

  it("draftTitle extracts a title from content_json, else falls back", () => {
    expect(draftTitle({ title: "The access model AI made obsolete" })).toBe(
      "The access model AI made obsolete"
    );
    expect(draftTitle({ title: "  " })).toBe("Untitled issue");
    expect(draftTitle(null)).toBe("Untitled issue");
    expect(draftTitle({ notitle: true }, "No title")).toBe("No title");
  });
});
