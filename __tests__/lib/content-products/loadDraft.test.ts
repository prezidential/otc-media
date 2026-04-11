import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabase } from "../../api/helpers";

const mockSupabase = createMockSupabase();

vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => mockSupabase,
}));

import { loadDraftContentJson } from "@/lib/content-products/loadDraft";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("loadDraftContentJson", () => {
  it("returns 400 when draftId is missing", async () => {
    const result = await loadDraftContentJson(undefined, "ws-123");
    expect(result).toEqual({
      ok: false,
      error: "draftId required",
      Status: 400,
    });
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  it("returns 500 when Supabase query fails", async () => {
    mockSupabase._setResult("issue_drafts", {
      data: null,
      error: { message: "db down" },
    });

    const result = await loadDraftContentJson("draft-1", "ws-123");
    expect(result).toEqual({
      ok: false,
      error: "db down",
      Status: 500,
    });
  });

  it("returns 404 when draft is missing content_json", async () => {
    mockSupabase._setResult("issue_drafts", {
      data: { id: "draft-1", content_json: null },
      error: null,
    });

    const result = await loadDraftContentJson("draft-1", "ws-123");
    expect(result).toEqual({
      ok: false,
      error: "Draft not found or has no content_json",
      Status: 404,
    });
  });

  it("returns content json and trims draft id for lookup", async () => {
    const chain = mockSupabase._setResult("issue_drafts", {
      data: { id: "draft-1", content_json: { title: "Issue A" } },
      error: null,
    });

    const result = await loadDraftContentJson(" draft-1  ", "ws-123");
    expect(result).toEqual({
      ok: true,
      draftId: "draft-1",
      contentJson: { title: "Issue A" },
    });
    expect(chain.eq).toHaveBeenCalledWith("id", "draft-1");
    expect(chain.eq).toHaveBeenCalledWith("workspace_id", "ws-123");
  });
});
