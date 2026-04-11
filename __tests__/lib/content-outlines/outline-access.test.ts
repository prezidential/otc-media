import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabase } from "../../api/helpers";
import { assertOutlineUsableForGenerate } from "@/lib/content-outlines/outline-access";

const mockSupabase = createMockSupabase();

beforeEach(() => {
  vi.clearAllMocks();
});

describe("assertOutlineUsableForGenerate", () => {
  it("returns 500 when lookup fails", async () => {
    mockSupabase._setResult("content_outlines", {
      data: null,
      error: { message: "db failed" },
    });

    const result = await assertOutlineUsableForGenerate(
      mockSupabase as never,
      "ws-123",
      "outline-1",
      "newsletter_issue"
    );

    expect(result).toEqual({
      ok: false,
      status: 500,
      error: "db failed",
    });
  });

  it("returns 404 when outline does not exist", async () => {
    mockSupabase._setResult("content_outlines", {
      data: null,
      error: null,
    });

    const result = await assertOutlineUsableForGenerate(
      mockSupabase as never,
      "ws-123",
      "missing-outline",
      "newsletter_issue"
    );

    expect(result).toEqual({
      ok: false,
      status: 404,
      error: "Outline not found.",
    });
  });

  it("returns 400 when outline is disabled", async () => {
    mockSupabase._setResult("content_outlines", {
      data: {
        id: "outline-1",
        kind: "newsletter_issue",
        disabled_at: "2026-03-20T00:00:00.000Z",
      },
      error: null,
    });

    const result = await assertOutlineUsableForGenerate(
      mockSupabase as never,
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
    mockSupabase._setResult("content_outlines", {
      data: {
        id: "outline-1",
        kind: "insider_access",
        disabled_at: null,
      },
      error: null,
    });

    const result = await assertOutlineUsableForGenerate(
      mockSupabase as never,
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

  it("returns ok for active matching outline", async () => {
    const chain = mockSupabase._setResult("content_outlines", {
      data: {
        id: "outline-1",
        kind: "newsletter_issue",
        disabled_at: null,
      },
      error: null,
    });

    const result = await assertOutlineUsableForGenerate(
      mockSupabase as never,
      "ws-123",
      "outline-1",
      "newsletter_issue"
    );

    expect(result).toEqual({ ok: true });
    expect(chain.eq).toHaveBeenCalledWith("workspace_id", "ws-123");
    expect(chain.eq).toHaveBeenCalledWith("id", "outline-1");
  });
});
