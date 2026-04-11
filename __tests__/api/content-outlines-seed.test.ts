import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabase } from "./helpers";
import { DEFAULT_INSIDER_OUTLINE, DEFAULT_NEWSLETTER_OUTLINE } from "@/lib/content-outlines/default-specs";

const mockSupabase = createMockSupabase();

vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => mockSupabase,
}));

import { POST } from "@/app/api/content-outlines/seed/route";

beforeEach(() => {
  vi.stubEnv("WORKSPACE_ID", "ws-123");
  vi.clearAllMocks();
});

describe("POST /api/content-outlines/seed", () => {
  it("returns inserted: 0 when outlines already exist", async () => {
    const chain = mockSupabase._setResult("content_outlines", { data: null, error: null });
    chain.limit = vi.fn().mockResolvedValue({ data: [{ id: "existing-outline" }], error: null });

    const res = await POST();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.inserted).toBe(0);
    expect(json.message).toBe("Content outlines already exist for workspace");
    expect(chain.insert).not.toHaveBeenCalled();
  });

  it("returns 500 when existing outlines check fails", async () => {
    const chain = mockSupabase._setResult("content_outlines", { data: null, error: null });
    chain.limit = vi.fn().mockResolvedValue({ data: null, error: { message: "fetch failed" } });

    const res = await POST();
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toBe("fetch failed");
    expect(chain.insert).not.toHaveBeenCalled();
  });

  it("seeds default newsletter and insider outlines for empty workspace", async () => {
    const insertedRows = [
      { id: "outline-news", kind: "newsletter_issue", name: "Default newsletter issue" },
      { id: "outline-insider", kind: "insider_access", name: "Default Insider Access" },
    ];

    const chain = mockSupabase._setResult("content_outlines", { data: insertedRows, error: null });
    chain.limit = vi.fn().mockResolvedValue({ data: [], error: null });

    const res = await POST();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.inserted).toBe(2);
    expect(json.outlines).toEqual(insertedRows);
    expect(chain.insert).toHaveBeenCalledWith([
      expect.objectContaining({
        workspace_id: "ws-123",
        name: "Default newsletter issue",
        kind: "newsletter_issue",
        spec_json: DEFAULT_NEWSLETTER_OUTLINE,
        is_default: true,
      }),
      expect.objectContaining({
        workspace_id: "ws-123",
        name: "Default Insider Access",
        kind: "insider_access",
        spec_json: DEFAULT_INSIDER_OUTLINE,
        is_default: true,
      }),
    ]);
    expect(chain.select).toHaveBeenCalledWith("id,kind,name");
  });

  it("returns 500 when insert fails", async () => {
    const chain = mockSupabase._setResult("content_outlines", {
      data: null,
      error: { message: "insert failed" },
    });
    chain.limit = vi.fn().mockResolvedValue({ data: [], error: null });

    const res = await POST();
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toBe("insert failed");
    expect(chain.insert).toHaveBeenCalledTimes(1);
  });
});
