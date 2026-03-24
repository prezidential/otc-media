import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabase } from "../../api/helpers";
import { DEFAULT_INSIDER_OUTLINE, DEFAULT_NEWSLETTER_OUTLINE } from "@/lib/content-outlines/default-specs";
import { resolveInsiderOutline, resolveNewsletterOutline } from "@/lib/content-outlines/fetch-outline";

const mockSupabase = createMockSupabase();

beforeEach(() => {
  vi.clearAllMocks();
});

describe("resolveNewsletterOutline", () => {
  it("returns explicit outline when id exists with newsletter kind", async () => {
    const chain = mockSupabase._setResult("content_outlines", {
      data: {
        id: "outline-1",
        kind: "newsletter_issue",
        spec_json: { version: 1, userPromptTemplate: "Custom {{PRIMARY_THESIS}}" },
      },
      error: null,
    });

    const result = await resolveNewsletterOutline(mockSupabase as never, "ws-123", "outline-1");

    expect(result.id).toBe("outline-1");
    expect(result.spec.userPromptTemplate).toBe("Custom {{PRIMARY_THESIS}}");
    expect(result.spec.systemPromptSuffix).toBe(DEFAULT_NEWSLETTER_OUTLINE.systemPromptSuffix);
    expect(chain.eq).toHaveBeenCalledWith("workspace_id", "ws-123");
    expect(chain.eq).toHaveBeenCalledWith("id", "outline-1");
    expect(chain.maybeSingle).toHaveBeenCalledTimes(1);
  });

  it("falls back when explicit id points to non-newsletter kind", async () => {
    mockSupabase._setResult("content_outlines", {
      data: { id: "outline-2", kind: "insider_access", spec_json: { version: 1 } },
      error: null,
    });

    const result = await resolveNewsletterOutline(mockSupabase as never, "ws-123", "outline-2");

    expect(result.id).toBeNull();
    expect(result.spec).toEqual(DEFAULT_NEWSLETTER_OUTLINE);
  });

  it("uses workspace default newsletter outline when no explicit id", async () => {
    const chain = mockSupabase._setResult("content_outlines", {
      data: [{ id: "default-newsletter", kind: "newsletter_issue", spec_json: { version: 1 } }],
      error: null,
    });

    const result = await resolveNewsletterOutline(mockSupabase as never, "ws-123");

    expect(result.id).toBe("default-newsletter");
    expect(result.spec).toEqual(DEFAULT_NEWSLETTER_OUTLINE);
    expect(chain.eq).toHaveBeenCalledWith("kind", "newsletter_issue");
    expect(chain.eq).toHaveBeenCalledWith("is_default", true);
    expect(chain.limit).toHaveBeenCalledWith(1);
  });
});

describe("resolveInsiderOutline", () => {
  it("falls back when explicit id points to non-insider kind", async () => {
    mockSupabase._setResult("content_outlines", {
      data: { id: "outline-3", kind: "newsletter_issue", spec_json: { version: 1 } },
      error: null,
    });

    const result = await resolveInsiderOutline(mockSupabase as never, "ws-123", "outline-3");

    expect(result.id).toBeNull();
    expect(result.spec).toEqual(DEFAULT_INSIDER_OUTLINE);
  });

  it("uses workspace default insider outline when available", async () => {
    const chain = mockSupabase._setResult("content_outlines", {
      data: [
        {
          id: "default-insider",
          kind: "insider_access",
          spec_json: { version: 1, systemPromptTemplate: "Custom Insider System Prompt" },
        },
      ],
      error: null,
    });

    const result = await resolveInsiderOutline(mockSupabase as never, "ws-123");

    expect(result.id).toBe("default-insider");
    expect(result.spec.userPromptTemplate).toBe(DEFAULT_INSIDER_OUTLINE.userPromptTemplate);
    expect(result.spec.systemPromptTemplate).toBe("Custom Insider System Prompt");
    expect(chain.eq).toHaveBeenCalledWith("kind", "insider_access");
    expect(chain.eq).toHaveBeenCalledWith("is_default", true);
    expect(chain.limit).toHaveBeenCalledWith(1);
  });
});
