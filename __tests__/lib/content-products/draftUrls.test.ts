import { describe, expect, it } from "vitest";
import { collectUrlsFromDraft, normalizeUrlForMatch } from "@/lib/content-products/draftUrls";

describe("normalizeUrlForMatch", () => {
  it("strips hash and trailing slash for comparison", () => {
    expect(normalizeUrlForMatch("https://Example.com/path/#x")).toBe("https://example.com/path");
    expect(normalizeUrlForMatch("https://example.com/path/")).toBe("https://example.com/path");
  });
});

describe("collectUrlsFromDraft", () => {
  it("collects sources and urls from fresh_signals", () => {
    const urls = collectUrlsFromDraft({
      sources: ["https://a.com/one", "https://b.com/two"],
      fresh_signals: "See https://c.com/three and (https://d.com/four).",
    });
    expect(urls).toContain("https://a.com/one");
    expect(urls).toContain("https://b.com/two");
    expect(urls).toContain("https://c.com/three");
    expect(urls).toContain("https://d.com/four");
  });

  it("returns empty when no urls", () => {
    expect(collectUrlsFromDraft({ sources: [], fresh_signals: "no links" })).toEqual([]);
  });
});
