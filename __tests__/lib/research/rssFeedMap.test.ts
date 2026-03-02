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
  });

  it("has at least 5 directives", () => {
    expect(Object.keys(RSS_FEED_MAP).length).toBeGreaterThanOrEqual(5);
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
    expect(RSS_FEED_MAP["Identity Vendor Moves"].length).toBeGreaterThanOrEqual(2);
  });
});
