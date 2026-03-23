import { describe, expect, it } from "vitest";
import { fillTemplate, parseNewsletterSpec } from "@/lib/content-outlines/types";
import { DEFAULT_NEWSLETTER_OUTLINE } from "@/lib/content-outlines/default-specs";

describe("fillTemplate", () => {
  it("replaces all placeholders", () => {
    expect(fillTemplate("A {{X}} B {{Y}}", { X: "1", Y: "2" })).toBe("A 1 B 2");
  });
});

describe("parseNewsletterSpec", () => {
  it("merges partial spec with fallback", () => {
    const out = parseNewsletterSpec({ version: 1, userPromptTemplate: "Hello {{PRIMARY_THESIS}}" }, DEFAULT_NEWSLETTER_OUTLINE);
    expect(out.userPromptTemplate).toBe("Hello {{PRIMARY_THESIS}}");
    expect(out.systemPromptSuffix).toBe(DEFAULT_NEWSLETTER_OUTLINE.systemPromptSuffix);
  });
});
