import { describe, expect, it } from "vitest";
import { createMockSupabase } from "../../api/helpers";
import { assertOutlineUsableForGenerate } from "@/lib/content-outlines/outline-access";

describe("assertOutlineUsableForGenerate", () => {
  it("returns 404 when outline does not exist", async () => {
    const supabase = createMockSupabase();
    supabase._setResult("content_outlines", { data: null, error: null });

    const result = await assertOutlineUsableForGenerate(
      supabase as never,
      "ws-123",
      "outline-missing",
      "newsletter_issue"
    );

    expect(result).toEqual({
      ok: false,
      status: 404,
      error: "Outline not found.",
    });
  });

  it("returns 400 when outline is disabled", async () => {
    const supabase = createMockSupabase();
    supabase._setResult("content_outlines", {
      data: {
        id: "outline-1",
        kind: "newsletter_issue",
        disabled_at: "2026-03-01T00:00:00.000Z",
      },
      error: null,
    });

    const result = await assertOutlineUsableForGenerate(
      supabase as never,
      "ws-123",
      "outline-1",
      "newsletter_issue"
    );

    expect(result).toEqual({
      ok: false,
      status: 400,
      error: "This outline is disabled. Choose an active outline or use the built-in default.",
    });
  });

  it("returns 400 when outline kind does not match expected kind", async () => {
    const supabase = createMockSupabase();
    supabase._setResult("content_outlines", {
      data: {
        id: "outline-1",
        kind: "insider_access",
        disabled_at: null,
      },
      error: null,
    });

    const result = await assertOutlineUsableForGenerate(
      supabase as never,
      "ws-123",
      "outline-1",
      "newsletter_issue"
    );

    expect(result).toEqual({
      ok: false,
      status: 400,
      error: "Outline kind does not match this operation.",
    });
  });

  it("returns 500 when supabase query fails", async () => {
    const supabase = createMockSupabase();
    supabase._setResult("content_outlines", {
      data: null,
      error: { message: "db unavailable" },
    });

    const result = await assertOutlineUsableForGenerate(
      supabase as never,
      "ws-123",
      "outline-1",
      "newsletter_issue"
    );

    expect(result).toEqual({
      ok: false,
      status: 500,
      error: "db unavailable",
    });
  });

  it("returns ok when outline exists, active, and kind matches", async () => {
    const supabase = createMockSupabase();
    supabase._setResult("content_outlines", {
      data: {
        id: "outline-1",
        kind: "newsletter_issue",
        disabled_at: null,
      },
      error: null,
    });

    const result = await assertOutlineUsableForGenerate(
      supabase as never,
      "ws-123",
      "outline-1",
      "newsletter_issue"
    );

    expect(result).toEqual({ ok: true });
  });
});
