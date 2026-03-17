import { describe, expect, it } from "vitest";
import { renderDraftHtml } from "@/lib/publish/renderHtml";
import type { DraftContentJson } from "@/lib/draft/content";

function makeDraft(overrides: Partial<DraftContentJson> = {}): DraftContentJson {
  return {
    title: "Identity Weekly",
    hook_paragraphs: ["Hook paragraph"],
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
  it("escapes potentially unsafe html in title and prose", () => {
    const html = renderDraftHtml(
      makeDraft({
        title: "<script>alert(1)</script>",
        hook_paragraphs: ["Use <b>only</b> trusted inputs & escapes"],
        deep_dive: "**Critical** <img src=x onerror=alert(1)>",
      })
    );

    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("trusted inputs &amp; escapes");
    expect(html).toContain("<strong>Critical</strong> &lt;img src=x onerror=alert(1)&gt;");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x onerror=alert(1)>");
  });

  it("renders fresh signals headings and source urls as links", () => {
    const html = renderDraftHtml(
      makeDraft({
        fresh_signals: `**Fresh Signals**

**Signal A**
Identity moved from static policy to runtime posture.
Sources:
- https://example.com/a

Follow-up note`,
      })
    );

    expect(html).toContain(">Fresh Signals</h2>");
    expect(html).toContain(">Signal A</h3>");
    expect(html).toContain('<a href="https://example.com/a"');
    expect(html).toContain(">Follow-up note</p>");
  });

  it("renders dojo, promo, and close containers", () => {
    const html = renderDraftHtml(
      makeDraft({
        dojo_checklist: ["First move", "Second move"],
        promo_slot: "Upgrade for deeper analysis.",
        close: "Stay sharp.\n\nSubscribe.",
      })
    );

    expect(html).toContain(">From the Dojo</h2>");
    expect(html).toContain("<li style=");
    expect(html).toContain("Upgrade for deeper analysis.");
    expect(html).toContain("Stay sharp.");
    expect(html).toContain("Subscribe.");
  });
});
