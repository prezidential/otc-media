import { describe, it, expect } from "vitest";
import {
  buildNudge,
  formatDayStamp,
  greetingParts,
  lastIngestStale,
  pickNeedsYou,
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
});
