import { describe, it, expect } from "vitest";
import { parseInline, parseBlocks } from "@/lib/markdown/lite";

describe("parseInline", () => {
  it("returns a single text token for plain text", () => {
    expect(parseInline("just words")).toEqual([{ type: "text", value: "just words" }]);
  });

  it("parses bold, italic, and inline code", () => {
    expect(parseInline("a **b** c")).toEqual([
      { type: "text", value: "a " },
      { type: "bold", value: "b" },
      { type: "text", value: " c" },
    ]);
    expect(parseInline("an _idea_")).toEqual([
      { type: "text", value: "an " },
      { type: "italic", value: "idea" },
    ]);
    expect(parseInline("run `npm test`")).toEqual([
      { type: "text", value: "run " },
      { type: "code", value: "npm test" },
    ]);
  });

  it("parses links into value + href", () => {
    expect(parseInline("see [docs](https://x.io)")).toEqual([
      { type: "text", value: "see " },
      { type: "link", value: "docs", href: "https://x.io" },
    ]);
  });

  it("does not format inside inline code", () => {
    expect(parseInline("`a **b**`")).toEqual([{ type: "code", value: "a **b**" }]);
  });
});

describe("parseBlocks", () => {
  it("splits paragraphs on blank lines", () => {
    const blocks = parseBlocks("one\n\ntwo");
    expect(blocks).toEqual([
      { type: "p", lines: ["one"] },
      { type: "p", lines: ["two"] },
    ]);
  });

  it("keeps soft line breaks within a paragraph", () => {
    expect(parseBlocks("line a\nline b")).toEqual([{ type: "p", lines: ["line a", "line b"] }]);
  });

  it("parses headings with levels", () => {
    expect(parseBlocks("## Title")).toEqual([{ type: "heading", level: 2, text: "Title" }]);
  });

  it("groups consecutive unordered list items", () => {
    expect(parseBlocks("- a\n- b\n- c")).toEqual([{ type: "ul", items: ["a", "b", "c"] }]);
  });

  it("groups consecutive ordered list items", () => {
    expect(parseBlocks("1. first\n2. second")).toEqual([{ type: "ol", items: ["first", "second"] }]);
  });

  it("captures fenced code blocks verbatim", () => {
    expect(parseBlocks("```\nconst x = 1\n```")).toEqual([{ type: "code", text: "const x = 1" }]);
  });

  it("handles a mixed document", () => {
    const md = "# Heading\n\nA paragraph with **bold**.\n\n- one\n- two";
    expect(parseBlocks(md)).toEqual([
      { type: "heading", level: 1, text: "Heading" },
      { type: "p", lines: ["A paragraph with **bold**."] },
      { type: "ul", items: ["one", "two"] },
    ]);
  });
});
