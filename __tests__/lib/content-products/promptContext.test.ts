import { describe, expect, it } from "vitest";
import { draftSummaryForContentProducts } from "@/lib/content-products/promptContext";

describe("draftSummaryForContentProducts", () => {
  it("builds a compact summary from key draft fields", () => {
    const summary = draftSummaryForContentProducts({
      title: "Identity Drift",
      metadata: { thesis: "Machine identities need explicit policy boundaries." },
      hook_paragraphs: ["Hook one.", "Hook two."],
      fresh_signals: "Fresh signal paragraph.",
      deep_dive: "Deep dive paragraph.",
      dojo_checklist: ["Do this", "Do that"],
    });

    expect(summary).toContain("Title: Identity Drift");
    expect(summary).toContain(
      "Thesis: Machine identities need explicit policy boundaries."
    );
    expect(summary).toContain("Opening hook:\nHook one.\n\nHook two.");
    expect(summary).toContain("Fresh signals (excerpt if long):\nFresh signal paragraph.");
    expect(summary).toContain("Deep dive:\nDeep dive paragraph.");
    expect(summary).toContain("From the Dojo:\n- Do this\n- Do that");
  });

  it("truncates deep_dive and fresh_signals to prompt-safe limits", () => {
    const longDeepDive = "d".repeat(3600);
    const longFreshSignals = "f".repeat(4200);

    const summary = draftSummaryForContentProducts({
      title: "Long issue",
      deep_dive: longDeepDive,
      fresh_signals: longFreshSignals,
    });

    expect(summary).toContain("[…truncated for prompt size…]");
    expect(summary).toContain("\n[…]");
    expect(summary).not.toContain(longDeepDive);
    expect(summary).not.toContain(longFreshSignals);
  });

  it("omits sections when fields are missing or wrong type", () => {
    const summary = draftSummaryForContentProducts({
      title: 123,
      metadata: { thesis: 99 },
      hook_paragraphs: "not-array",
      fresh_signals: ["not", "string"],
      deep_dive: null,
      dojo_checklist: "nope",
    } as unknown as Record<string, unknown>);

    expect(summary).toBe("Title: ");
  });
});
