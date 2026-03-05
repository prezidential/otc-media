import { describe, it, expect } from "vitest";
import {
  parseDraftToStructured,
  getSectionBlocks,
  replaceSectionInContent,
  emptyContentJson,
} from "@/lib/draft/parse";

const NUMBERED_DRAFT = `1) Title
Identity at Machine Speed

2) Opening Hook
Something just shifted.
Not in a hype cycle way.

The identity model broke under autonomous load.

3) Fresh Signals
**Supply Chain Meets Identity**

Cline CLI attack shows trust is fragile.

Sources:
- https://example.com/article1

4) Deep Dive
Identity programs are failing because they classify agents as users.

**This is a classification failure.**

The consequence is operational blindness.

5) From the Dojo
- Create an AI agent identity class
- Instrument behavior not authentication
- Treat config as infrastructure
- Build machine speed authorization
- Add audit trails for autonomous decisions

6) Promo Slot
Subscribe to premium content.

7) Close
Stay sharp.

Subscribe.`;

const MARKDOWN_DRAFT = `**Identity at Machine Speed**

Something just shifted.
Not in a hype cycle way.

**Fresh Signals**

**Supply Chain Meets Identity**

Cline CLI attack.

Sources:
- https://example.com/article1

**Deep Dive**

Identity programs are failing.

**From the Dojo**

- Create identity class
- Instrument behavior
- Treat config as infra
- Build authorization
- Add audit trails

**Promo Slot**

Subscribe to premium.

**Close**

Stay sharp.`;

// ─── parseDraftToStructured ──────────────────────────────────────

describe("parseDraftToStructured", () => {
  it("parses numbered format correctly", () => {
    const result = parseDraftToStructured(NUMBERED_DRAFT, { thesis: "T", model: "M" });
    expect(result).not.toBeNull();
    expect(result!.title).toBe("Identity at Machine Speed");
    expect(result!.hook_paragraphs.length).toBeGreaterThanOrEqual(1);
    expect(result!.deep_dive).toContain("classification failure");
    expect(result!.dojo_checklist.length).toBeGreaterThanOrEqual(5);
    expect(result!.metadata).toEqual({ thesis: "T", model: "M" });
  });

  it("parses markdown format correctly", () => {
    const result = parseDraftToStructured(MARKDOWN_DRAFT, {});
    expect(result).not.toBeNull();
    expect(result!.title).toBe("Identity at Machine Speed");
    expect(result!.fresh_signals).toContain("Fresh Signals");
    expect(result!.deep_dive).toContain("failing");
    expect(result!.dojo_checklist.length).toBe(5);
  });

  it("returns null for empty string", () => {
    expect(parseDraftToStructured("", {})).toBeNull();
  });

  it("returns null for whitespace-only string", () => {
    expect(parseDraftToStructured("   \n  \n  ", {})).toBeNull();
  });

  it("extracts source URLs", () => {
    const result = parseDraftToStructured(NUMBERED_DRAFT, {});
    expect(result!.sources).toContain("https://example.com/article1");
  });

  it("preserves metadata passthrough", () => {
    const result = parseDraftToStructured(NUMBERED_DRAFT, {
      thesis: "Test thesis",
      model: "claude-test",
    });
    expect(result!.metadata.thesis).toBe("Test thesis");
    expect(result!.metadata.model).toBe("claude-test");
  });

  it("handles CRLF line endings", () => {
    const crlf = NUMBERED_DRAFT.replace(/\n/g, "\r\n");
    const result = parseDraftToStructured(crlf, {});
    expect(result).not.toBeNull();
    expect(result!.title).toBe("Identity at Machine Speed");
  });
});

// ─── getSectionBlocks ────────────────────────────────────────────

describe("getSectionBlocks", () => {
  it("splits numbered draft into blocks", () => {
    const blocks = getSectionBlocks(NUMBERED_DRAFT);
    expect(blocks.length).toBeGreaterThanOrEqual(5);
  });

  it("splits markdown draft into blocks", () => {
    const blocks = getSectionBlocks(MARKDOWN_DRAFT);
    expect(blocks.length).toBeGreaterThanOrEqual(5);
  });

  it("returns empty array for empty input", () => {
    expect(getSectionBlocks("")).toEqual([]);
  });

  it("first block contains title", () => {
    const blocks = getSectionBlocks(NUMBERED_DRAFT);
    expect(blocks[0]).toContain("Title");
  });
});

// ─── replaceSectionInContent ─────────────────────────────────────

describe("replaceSectionInContent", () => {
  it("replaces title section", () => {
    const result = replaceSectionInContent(NUMBERED_DRAFT, "title", "New Title Here");
    expect(result).toContain("New Title Here");
    expect(result).toContain("Opening Hook");
  });

  it("replaces hook section", () => {
    const result = replaceSectionInContent(NUMBERED_DRAFT, "hook", "A brand new hook.\n\nSecond para.");
    expect(result).toContain("A brand new hook.");
    expect(result).toContain("Second para.");
  });

  it("replaces deep_dive section", () => {
    const result = replaceSectionInContent(NUMBERED_DRAFT, "deep_dive", "New deep dive content.");
    expect(result).toContain("New deep dive content.");
    expect(result).not.toContain("classification failure");
  });

  it("replaces dojo_checklist section", () => {
    const result = replaceSectionInContent(NUMBERED_DRAFT, "dojo_checklist", "- New bullet 1\n- New bullet 2");
    expect(result).toContain("New bullet 1");
  });

  it("preserves other sections when replacing one", () => {
    const result = replaceSectionInContent(NUMBERED_DRAFT, "title", "Changed Title");
    expect(result).toContain("Fresh Signals");
    expect(result).toContain("Deep Dive");
    expect(result).toContain("From the Dojo");
  });

  it("returns original content for invalid section index", () => {
    const blocks = getSectionBlocks("");
    expect(blocks).toEqual([]);
  });
});

// ─── emptyContentJson ────────────────────────────────────────────

describe("emptyContentJson", () => {
  it("returns empty draft shape", () => {
    const empty = emptyContentJson({});
    expect(empty.title).toBe("");
    expect(empty.hook_paragraphs).toEqual([]);
    expect(empty.dojo_checklist).toEqual([]);
    expect(empty.sources).toEqual([]);
  });
});
