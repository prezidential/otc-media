import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabase, makeJsonRequest } from "./helpers";

const mockSupabase = createMockSupabase();
const mockRenderDraftHtml = vi.fn(() => "<p>rendered</p>");

vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => mockSupabase,
}));

vi.mock("@/lib/publish/renderHtml", () => ({
  renderDraftHtml: mockRenderDraftHtml,
}));

import { POST } from "@/app/api/publish/export-html/route";

beforeEach(() => {
  vi.stubEnv("WORKSPACE_ID", "ws-123");
  vi.clearAllMocks();
});

describe("POST /api/publish/export-html", () => {
  it("returns 400 when draftId is missing", async () => {
    const req = makeJsonRequest("http://localhost:3000/api/publish/export-html", {});
    const res = await POST(req);

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "draftId required" });
  });

  it("returns 404 when draft does not exist", async () => {
    mockSupabase._setResult("issue_drafts", { data: null, error: null });

    const req = makeJsonRequest("http://localhost:3000/api/publish/export-html", {
      draftId: "draft-1",
    });
    const res = await POST(req);

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({ error: "Draft not found" });
  });

  it("returns 400 when draft has no structured content", async () => {
    mockSupabase._setResult("issue_drafts", {
      data: { id: "draft-1", content_json: null },
      error: null,
    });

    const req = makeJsonRequest("http://localhost:3000/api/publish/export-html", {
      id: "draft-1",
    });
    const res = await POST(req);

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: "Draft has no structured content",
    });
  });

  it("returns rendered html and title on success", async () => {
    const contentJson = {
      title: "Issue title",
      hook_paragraphs: [],
      fresh_signals: "",
      deep_dive: "",
      dojo_checklist: [],
      promo_slot: "",
      close: "",
      sources: [],
      metadata: {},
    };
    mockSupabase._setResult("issue_drafts", {
      data: { id: "draft-1", content_json: contentJson },
      error: null,
    });

    const req = makeJsonRequest("http://localhost:3000/api/publish/export-html", {
      draftId: "draft-1",
    });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.title).toBe("Issue title");
    expect(json.html).toBe("<p>rendered</p>");
    expect(mockRenderDraftHtml).toHaveBeenCalledWith(contentJson);
  });
});
