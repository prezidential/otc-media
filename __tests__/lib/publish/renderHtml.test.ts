import { describe, it, expect } from "vitest";
import { renderDraftHtml } from "@/lib/publish/renderHtml";
import type { DraftContentJson } from "@/lib/draft/content";

function makeDraft(overrides: Partial<DraftContentJson> = {}): DraftContentJson {
  return {
    title: "Issue Title",
    hook_paragraphs: [],
    fresh_signals: "",
    deep_dive: "",
    dojo_checklist: [],
    promo_slot: "",
    close: "",
    sources: [],
    metadata: {},
    ...overrides,
  };
}

describe("renderDraftHtml", () => {
  it("escapes HTML while preserving markdown bold in prose", () => {
    const html = renderDraftHtml(
      makeDraft({
        title: "<script>alert(1)</script>",
        hook_paragraphs: ["Hook with <b>tag</b>"],
        deep_dive: "This is **critical** and <i>unsafe</i>",
      })
    );

    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("Hook with &lt;b&gt;tag&lt;/b&gt;");
    expect(html).toContain("<strong>critical</strong>");
    expect(html).toContain("&lt;i&gt;unsafe&lt;/i&gt;");
    expect(html).not.toContain("<script>alert(1)</script>");
  });

  it("renders Fresh Signals headers and source links", () => {
    const html = renderDraftHtml(
      makeDraft({
        fresh_signals: [
          "**Fresh Signals**",
          "**Signal One**",
          "A notable shift",
          "Sources:",
          "- http://example.com/a?x=<tag>",
          "- http://example.com/b",
        ].join("\n"),
      })
    );

    expect(html).toContain(">Fresh Signals</h2>");
    expect(html).toContain(">Signal One</h3>");
    expect(html).toContain("A notable shift");
    expect(html).toContain('href="http://example.com/a?x=&lt;tag&gt;"');
    expect(html).toContain('href="http://example.com/b"');

    const linkMatches = html.match(/<a href="/g) ?? [];
    expect(linkMatches).toHaveLength(2);
  });
});
