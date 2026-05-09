import { describe, expect, it, vi } from "vitest";
import {
  formatSignalGroundingForPrompt,
  resolveSignalsForDraft,
} from "@/lib/content-products/resolveSignals";
import { createMockSupabaseChain } from "@/__tests__/api/helpers";

function supabaseForSignals(result: { data: unknown; error: unknown }) {
  const chain = createMockSupabaseChain(result);
  return { from: vi.fn(() => chain), chain };
}

describe("resolveSignalsForDraft", () => {
  it("returns early when draft contains no citation URLs", async () => {
    const supabase = supabaseForSignals({ data: [], error: null });

    const resolved = await resolveSignalsForDraft(supabase as never, "ws-1", {
      title: "No links here",
    });

    expect(resolved).toEqual({ grounded: [], unmatchedUrls: [] });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("matches normalized URLs, deduplicates by normalized key, and keeps unresolved URLs", async () => {
    const { chain, ...supabase } = supabaseForSignals({
      data: [
        {
          id: "sig-1",
          url: "https://example.com/alpha",
          title: "Alpha launch",
          publisher: "IAM Weekly",
          normalized_summary: "  Summary line  ",
          raw_text: null,
        },
        {
          id: "sig-2",
          url: "https://example.com/raw-text",
          title: "Raw text fallback",
          publisher: 42,
          normalized_summary: "",
          raw_text: "r".repeat(450),
        },
        {
          id: 99,
          url: "https://example.com/untitled",
          title: "Bad id type should not resolve",
          publisher: "Ignored",
          normalized_summary: "Ignored",
          raw_text: null,
        },
      ],
      error: null,
    });

    const resolved = await resolveSignalsForDraft(supabase as never, "ws-1", {
      sources: [
        "https://example.com/alpha/#fragment",
        "https://example.com/alpha/",
        "https://example.com/missing",
      ],
      fresh_signals:
        "Also see https://example.com/alpha and https://example.com/raw-text and https://example.com/untitled",
    });

    expect(chain.select).toHaveBeenCalledWith("id,url,title,publisher,normalized_summary,raw_text");
    expect(chain.eq).toHaveBeenCalledWith("workspace_id", "ws-1");

    expect(resolved.grounded).toHaveLength(2);
    expect(resolved.grounded[0]).toEqual({
      id: "sig-1",
      url: "https://example.com/alpha",
      title: "Alpha launch",
      publisher: "IAM Weekly",
      excerpt: "Summary line",
    });
    expect(resolved.grounded[1].id).toBe("sig-2");
    expect(resolved.grounded[1].publisher).toBeNull();
    expect(resolved.grounded[1].excerpt?.endsWith("…")).toBe(true);
    expect(resolved.grounded[1].excerpt?.length).toBe(398);

    expect(resolved.unmatchedUrls).toEqual([
      "https://example.com/missing",
      "https://example.com/untitled",
    ]);
  });

  it("returns requested URLs as unmatched when signal query fails", async () => {
    const supabase = supabaseForSignals({ data: null, error: { message: "db down" } });

    const resolved = await resolveSignalsForDraft(supabase as never, "ws-1", {
      sources: ["https://example.com/one", "https://example.com/two"],
    });

    expect(resolved).toEqual({
      grounded: [],
      unmatchedUrls: ["https://example.com/one", "https://example.com/two"],
    });
  });
});

describe("formatSignalGroundingForPrompt", () => {
  it("renders resolved and unresolved entries for prompt grounding", () => {
    const text = formatSignalGroundingForPrompt(
      [
        {
          id: "sig-1",
          url: "https://example.com/alpha",
          title: "Alpha launch",
          publisher: "IAM Weekly",
          excerpt: "Summary line",
        },
      ],
      ["https://example.com/unresolved"]
    );

    expect(text).toContain("### Signal grounding");
    expect(text).toContain("- [resolved] Alpha launch (IAM Weekly)");
    expect(text).toContain("URL: https://example.com/alpha");
    expect(text).toContain("Excerpt: Summary line");
    expect(text).toContain("- [unresolved] https://example.com/unresolved");
  });

  it("adds an explicit no-citations note when both lists are empty", () => {
    const text = formatSignalGroundingForPrompt([], []);
    expect(text).toContain("(No citation URLs were extracted from this draft.)");
  });
});
