import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabase, makeJsonRequest } from "./helpers";

const mockSupabase = createMockSupabase();
const mockIsBeehiivEnabled = vi.fn();
const mockCreateBeehiivDraft = vi.fn();
const mockRenderDraftHtml = vi.fn(() => "<p>rendered</p>");

vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => mockSupabase,
}));

vi.mock("@/lib/publish/beehiiv", () => ({
  isBeehiivEnabled: mockIsBeehiivEnabled,
  createBeehiivDraft: mockCreateBeehiivDraft,
}));

vi.mock("@/lib/publish/renderHtml", () => ({
  renderDraftHtml: mockRenderDraftHtml,
}));

import { POST } from "@/app/api/publish/beehiiv/route";

beforeEach(() => {
  vi.stubEnv("WORKSPACE_ID", "ws-123");
  vi.clearAllMocks();
  mockIsBeehiivEnabled.mockReturnValue(true);
});

describe("POST /api/publish/beehiiv", () => {
  it("returns 403 when integration is disabled", async () => {
    mockIsBeehiivEnabled.mockReturnValue(false);

    const req = makeJsonRequest("http://localhost:3000/api/publish/beehiiv", {
      draftId: "draft-1",
    });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.error).toContain("Beehiiv integration is not enabled");
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  it("returns 400 when draftId is missing", async () => {
    const req = makeJsonRequest("http://localhost:3000/api/publish/beehiiv", {});
    const res = await POST(req);

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "draftId required" });
  });

  it("returns 400 when draft has no structured content", async () => {
    mockSupabase._setResult("issue_drafts", {
      data: { id: "draft-1", content_json: null },
      error: null,
    });

    const req = makeJsonRequest("http://localhost:3000/api/publish/beehiiv", {
      draftId: "draft-1",
    });
    const res = await POST(req);

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: "Draft has no structured content",
    });
  });

  it("publishes draft with rendered html and thesis subtitle", async () => {
    const contentJson = {
      title: "Identity at scale",
      hook_paragraphs: [],
      fresh_signals: "",
      deep_dive: "",
      dojo_checklist: [],
      promo_slot: "",
      close: "",
      sources: [],
      metadata: { thesis: "The stack changed faster than controls" },
    };
    mockSupabase._setResult("issue_drafts", {
      data: { id: "draft-1", content_json: contentJson },
      error: null,
    });
    mockCreateBeehiivDraft.mockResolvedValue({
      id: "post-1",
      title: "Identity at scale",
      status: "draft",
      web_url: "https://beehiiv.com/post-1",
    });

    const req = makeJsonRequest("http://localhost:3000/api/publish/beehiiv", {
      id: "draft-1",
    });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.beehiiv.id).toBe("post-1");
    expect(mockRenderDraftHtml).toHaveBeenCalledWith(contentJson);
    expect(mockCreateBeehiivDraft).toHaveBeenCalledWith({
      title: "Identity at scale",
      subtitle: "The stack changed faster than controls",
      htmlContent: "<p>rendered</p>",
    });
  });

  it("returns 500 with publish error details", async () => {
    mockSupabase._setResult("issue_drafts", {
      data: {
        id: "draft-1",
        content_json: {
          title: "",
          hook_paragraphs: [],
          fresh_signals: "",
          deep_dive: "",
          dojo_checklist: [],
          promo_slot: "",
          close: "",
          sources: [],
          metadata: {},
        },
      },
      error: null,
    });
    mockCreateBeehiivDraft.mockRejectedValue(new Error("Beehiiv API error: quota exceeded"));

    const req = makeJsonRequest("http://localhost:3000/api/publish/beehiiv", {
      draftId: "draft-1",
    });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.ok).toBe(false);
    expect(json.error).toContain("quota exceeded");
  });
});
