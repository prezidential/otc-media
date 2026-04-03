import { describe, expect, it } from "vitest";
import { createMockSupabase } from "../../api/helpers";
import { assertOutlineUsableForGenerate } from "@/lib/content-outlines/outline-access";

describe("assertOutlineUsableForGenerate", () => {
  it("returns 500 when outline lookup fails", async () => {
    const mockSupabase = createMockSupabase();
    const chain = mockSupabase._setResult("content_outlines", {
      data: null,
      error: { message: "db exploded" },
    });

    const result = await assertOutlineUsableForGenerate(
      mockSupabase as never,
      "ws-123",
      "outline-1",
      "newsletter_issue"
    );

    expect(result).toEqual({ ok: false, status: 500, error: "db exploded" });
    expect(chain.eq).toHaveBeenCalledWith("workspace_id", "ws-123");
    expect(chain.eq).toHaveBeenCalledWith("id", "outline-1");
    expect(chain.maybeSingle).toHaveBeenCalledTimes(1);
  });

  it("returns 404 when outline does not exist", async () => {
    const mockSupabase = createMockSupabase();
    mockSupabase._setResult("content_outlines", { data: null, error: null });

    const result = await assertOutlineUsableForGenerate(
      mockSupabase as never,
      "ws-123",
      "outline-404",
      "newsletter_issue"
    );

    expect(result).toEqual({ ok: false, status: 404, error: "Outline not found." });
  });

  it("returns 400 when outline is disabled", async () => {
    const mockSupabase = createMockSupabase();
    mockSupabase._setResult("content_outlines", {
      data: {
        id: "outline-disabled",
        kind: "newsletter_issue",
        disabled_at: "2026-03-31T00:00:00Z",
      },
      error: null,
    });

    const result = await assertOutlineUsableForGenerate(
      mockSupabase as never,
      "ws-123",
      "outline-disabled",
      "newsletter_issue"
    );

    expect(result).toEqual({
      ok: false,
      status: 400,
      error: "This outline is disabled. Choose an active outline or use the built-in default.",
    });
  });

  it("returns 400 when kind does not match expected operation", async () => {
    const mockSupabase = createMockSupabase();
    mockSupabase._setResult("content_outlines", {
      data: {
        id: "outline-kind-mismatch",
        kind: "insider_access",
        disabled_at: null,
      },
      error: null,
    });

    const result = await assertOutlineUsableForGenerate(
      mockSupabase as never,
      "ws-123",
      "outline-kind-mismatch",
      "newsletter_issue"
    );

    expect(result).toEqual({
      ok: false,
      status: 400,
      error: "Outline kind does not match this operation.",
    });
  });

  it("returns ok when outline is active and kind matches", async () => {
    const mockSupabase = createMockSupabase();
    mockSupabase._setResult("content_outlines", {
      data: {
        id: "outline-ok",
        kind: "newsletter_issue",
        disabled_at: null,
      },
      error: null,
    });

    const result = await assertOutlineUsableForGenerate(
      mockSupabase as never,
      "ws-123",
      "outline-ok",
      "newsletter_issue"
    );

    expect(result).toEqual({ ok: true });
  });
});
