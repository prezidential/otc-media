import { describe, it, expect } from "vitest";
import { RSS_FEED_MAP } from "@/lib/research/rssFeedMap";

describe("RSS_FEED_MAP", () => {
  it("contains all expected directive names", () => {
    const keys = Object.keys(RSS_FEED_MAP);
    expect(keys).toContain("Identity Vendor Moves");
    expect(keys).toContain("Non-Human Identity Incidents");
    expect(keys).toContain("Identity + AI");
    expect(keys).toContain("Regulatory and Standards");
    expect(keys).toContain("IGA Modernization and Migration");
    expect(keys).toContain("CIEM and Cloud Identity");
    expect(keys).toContain("Identity Threat Detection");
    expect(keys).toContain("Agentic AI Security");
  });

  it("has at least 8 directives", () => {
    expect(Object.keys(RSS_FEED_MAP).length).toBeGreaterThanOrEqual(8);
  });

  it("every directive maps to a non-empty array of URLs", () => {
    for (const [name, urls] of Object.entries(RSS_FEED_MAP)) {
      expect(Array.isArray(urls), `${name} should map to an array`).toBe(true);
      expect(urls.length, `${name} should have at least one URL`).toBeGreaterThanOrEqual(1);
    }
  });

  it("all feed URLs are valid HTTP(S) URLs", () => {
    for (const urls of Object.values(RSS_FEED_MAP)) {
      for (const url of urls) {
        expect(url).toMatch(/^https?:\/\//);
        expect(() => new URL(url)).not.toThrow();
      }
    }
  });

  it("Identity Vendor Moves has multiple feeds", () => {
    expect(RSS_FEED_MAP["Identity Vendor Moves"].length).toBeGreaterThanOrEqual(3);
  });

  it("CIEM and Cloud Identity includes cloud vendor feeds", () => {
    const feeds = RSS_FEED_MAP["CIEM and Cloud Identity"];
    const hasAws = feeds.some((u) => u.includes("aws.amazon.com"));
    const hasMicrosoft = feeds.some((u) => u.includes("microsoft.com"));
    expect(hasAws).toBe(true);
    expect(hasMicrosoft).toBe(true);
  });

  it("Identity Threat Detection includes investigative sources", () => {
    const feeds = RSS_FEED_MAP["Identity Threat Detection"];
    const hasKrebs = feeds.some((u) => u.includes("krebsonsecurity"));
    const hasSchneier = feeds.some((u) => u.includes("schneier"));
    expect(hasKrebs).toBe(true);
    expect(hasSchneier).toBe(true);
  });

  it("Agentic AI Security includes AI safety and red-team sources", () => {
    const feeds = RSS_FEED_MAP["Agentic AI Security"];
    const hasEmbraceTheRed = feeds.some((u) => u.includes("embracethered"));
    const hasTrailOfBits = feeds.some((u) => u.includes("trailofbits"));
    expect(hasEmbraceTheRed).toBe(true);
    expect(hasTrailOfBits).toBe(true);
  });

  it("no duplicate URLs within a single directive", () => {
    for (const [name, urls] of Object.entries(RSS_FEED_MAP)) {
      const unique = new Set(urls);
      expect(unique.size, `${name} has duplicate URLs`).toBe(urls.length);
    }
  });
});
