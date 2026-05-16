import { describe, expect, it, vi } from "vitest";
import {
  formatSignalGroundingForPrompt,
  resolveSignalsForDraft,
} from "@/lib/content-products/resolveSignals";

function supabaseForSignalsQuery(result: { data: unknown; error: unknown }) {
  const eq = vi.fn().mockResolvedValue(result);
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });
  return { from, eq, select };
}

describe("resolveSignalsForDraft", () => {
  it("skips database lookup when draft has no citation URLs", async () => {
    const supabase = { from: vi.fn() };
    const result = await resolveSignalsForDraft(supabase as never, "ws-1", {
      sources: [],
      fresh_signals: "No links here",
    });

    expect(result).toEqual({ grounded: [], unmatchedUrls: [] });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("returns all requested URLs as unmatched when signal query fails", async () => {
    const supabase = supabaseForSignalsQuery({
      data: null,
      error: { message: "db unavailable" },
    });

    const result = await resolveSignalsForDraft(supabase as never, "ws-1", {
      sources: ["https://example.com/one"],
      fresh_signals: "",
    });

    expect(result).toEqual({
      grounded: [],
      unmatchedUrls: ["https://example.com/one"],
    });
    expect(supabase.from).toHaveBeenCalledWith("signals");
    expect(supabase.select).toHaveBeenCalledWith("id,url,title,publisher,normalized_summary,raw_text");
    expect(supabase.eq).toHaveBeenCalledWith("workspace_id", "ws-1");
  });

  it("deduplicates by normalized URL and keeps only valid grounded rows", async () => {
    const longSummary = "x".repeat(500);
    const supabase = supabaseForSignalsQuery({
      data: [
        {
          id: "sig-1",
          url: "https://news.example.com/path",
          title: "Signal Title",
          publisher: "Example News",
          normalized_summary: longSummary,
          raw_text: null,
        },
        {
          id: "sig-2",
          url: "https://news.example.com/invalid-row",
          title: null,
          publisher: "Broken",
          normalized_summary: "ignored",
          raw_text: null,
        },
      ],
      error: null,
    });

    const result = await resolveSignalsForDraft(supabase as never, "ws-1", {
      sources: [
        "https://news.example.com/path/",
        "https://news.example.com/path#anchor",
        "https://news.example.com/invalid-row",
        "https://news.example.com/missing",
      ],
    });

    expect(result.grounded).toHaveLength(1);
    expect(result.grounded[0]).toMatchObject({
      id: "sig-1",
      title: "Signal Title",
      publisher: "Example News",
      url: "https://news.example.com/path",
    });
    expect(result.grounded[0].excerpt).toHaveLength(398);
    expect(result.unmatchedUrls).toEqual([
      "https://news.example.com/invalid-row",
      "https://news.example.com/missing",
    ]);
  });
});

describe("formatSignalGroundingForPrompt", () => {
  it("renders resolved and unresolved signal sections", () => {
    const block = formatSignalGroundingForPrompt(
      [
        {
          id: "sig-1",
          url: "https://example.com/post",
          title: "Post",
          publisher: "Example",
          excerpt: "Summary",
        },
      ],
      ["https://example.com/unresolved"]
    );

    expect(block).toContain("### Signal grounding");
    expect(block).toContain("- [resolved] Post (Example)");
    expect(block).toContain("URL: https://example.com/post");
    expect(block).toContain("Excerpt: Summary");
    expect(block).toContain("- [unresolved] https://example.com/unresolved");
  });

  it("renders empty-state message when there are no extracted URLs", () => {
    const block = formatSignalGroundingForPrompt([], []);
    expect(block).toContain("(No citation URLs were extracted from this draft.)");
  });
});
