import { describe, it, expect } from "vitest";
import {
  parseFreshSignals,
  serializeFreshSignals,
  isFreshSignalsEmpty,
  FRESH_SIGNALS_HEADER,
} from "@/lib/draft/freshSignals";

describe("parseFreshSignals", () => {
  it("returns empty model for empty / nullish input", () => {
    expect(parseFreshSignals("")).toEqual({ synopsis: "", items: [] });
    expect(parseFreshSignals(null)).toEqual({ synopsis: "", items: [] });
    expect(parseFreshSignals(undefined)).toEqual({ synopsis: "", items: [] });
    expect(parseFreshSignals("   \n  ")).toEqual({ synopsis: "", items: [] });
  });

  it("parses header, synopsis, and items with sources", () => {
    const raw = [
      "**Fresh Signals**",
      "",
      "Three things moved the needle on machine identity this week.",
      "",
      "**OWASP ships agentic threat list**",
      "",
      "Names prompt injection as a first-class NHI risk.",
      "",
      "Sources:",
      "- https://example.com/owasp",
      "",
      "**NIST drafts IAM-for-agents note**",
      "",
      "Sources:",
      "- https://example.com/nist",
    ].join("\n");

    const model = parseFreshSignals(raw);
    expect(model.synopsis).toBe(
      "Three things moved the needle on machine identity this week."
    );
    expect(model.items).toHaveLength(2);
    expect(model.items[0]).toEqual({
      headline: "OWASP ships agentic threat list",
      url: "https://example.com/owasp",
      note: "Names prompt injection as a first-class NHI risk.",
    });
    expect(model.items[1].headline).toBe("NIST drafts IAM-for-agents note");
    expect(model.items[1].url).toBe("https://example.com/nist");
    expect(model.items[1].note).toBeUndefined();
  });

  it("handles a synopsis-only slot (no items)", () => {
    const model = parseFreshSignals("**Fresh Signals**\n\nJust a framing line.");
    expect(model.synopsis).toBe("Just a framing line.");
    expect(model.items).toEqual([]);
  });
});

describe("serializeFreshSignals", () => {
  it("returns empty string when slot is empty", () => {
    expect(serializeFreshSignals({ synopsis: "", items: [] })).toBe("");
    expect(
      serializeFreshSignals({ synopsis: "  ", items: [{ headline: "", url: "", note: "" }] })
    ).toBe("");
  });

  it("serializes header + synopsis + items deterministically", () => {
    const out = serializeFreshSignals({
      synopsis: "Framing.",
      items: [{ headline: "Headline A", url: "https://a.test", note: "Why it matters." }],
    });
    expect(out.startsWith(FRESH_SIGNALS_HEADER)).toBe(true);
    expect(out).toContain("**Headline A**");
    expect(out).toContain("Why it matters.");
    expect(out).toContain("Sources:\n- https://a.test");
  });

  it("round-trips parse -> serialize -> parse", () => {
    const raw = [
      "**Fresh Signals**",
      "",
      "Synopsis line.",
      "",
      "**Item one**",
      "",
      "Note one.",
      "",
      "Sources:",
      "- https://one.test",
    ].join("\n");
    const model = parseFreshSignals(raw);
    const reparsed = parseFreshSignals(serializeFreshSignals(model));
    expect(reparsed).toEqual(model);
  });

  it("falls back to a placeholder headline when missing but url present", () => {
    const out = serializeFreshSignals({ synopsis: "", items: [{ headline: "", url: "https://x.test" }] });
    expect(out).toContain("**Untitled signal**");
    expect(out).toContain("https://x.test");
  });
});

describe("isFreshSignalsEmpty", () => {
  it("is true for empty and false when content exists", () => {
    expect(isFreshSignalsEmpty("")).toBe(true);
    expect(isFreshSignalsEmpty("**Fresh Signals**")).toBe(true);
    expect(isFreshSignalsEmpty("**Fresh Signals**\n\nHas synopsis.")).toBe(false);
  });
});
