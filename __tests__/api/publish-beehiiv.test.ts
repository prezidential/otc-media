import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockSupabase, makeJsonRequest } from "./helpers";

const mockSupabase = createMockSupabase();
const isBeehiivEnabledMock = vi.fn();
const createBeehiivDraftMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => mockSupabase,
}));
vi.mock("@/lib/publish/beehiiv", () => ({
  isBeehiivEnabled: () => isBeehiivEnabledMock(),
  createBeehiivDraft: (params: unknown) => createBeehiivDraftMock(params),
}));

import { POST } from "@/app/api/publish/beehiiv/route";

beforeEach(() => {
  vi.stubEnv("WORKSPACE_ID", "ws-123");
  vi.clearAllMocks();

  isBeehiivEnabledMock.mockReturnValue(true);
  createBeehiivDraftMock.mockResolvedValue({
    id: "post-1",
    title: "Issue 1",
    status: "draft",
    web_url: "https://example.com/post-1",
  });
});

describe("POST /api/publish/beehiiv", () => {
  it("returns 403 when integration is disabled", async () => {
    isBeehiivEnabledMock.mockReturnValue(false);

    const req = makeJsonRequest("http://localhost:3000/api/publish/beehiiv", {
      draftId: "draft-1",
    });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.error).toContain("not enabled");
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  it("returns 400 when draftId is missing", async () => {
    const req = makeJsonRequest("http://localhost:3000/api/publish/beehiiv", {});
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toContain("draftId required");
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
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toContain("no structured content");
    expect(createBeehiivDraftMock).not.toHaveBeenCalled();
  });

  it("publishes draft content with thesis as subtitle", async () => {
    mockSupabase._setResult("issue_drafts", {
      data: {
        id: "draft-1",
        content_json: {
          title: "Identity <Shift>",
          hook_paragraphs: ["First paragraph"],
          fresh_signals: "",
          deep_dive: "This is **important**",
          dojo_checklist: [],
          promo_slot: "",
          close: "",
          sources: [],
          metadata: { thesis: "Agents need guardrails" },
        },
      },
      error: null,
    });

    const req = makeJsonRequest("http://localhost:3000/api/publish/beehiiv", {
      id: "draft-1",
    });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.beehiiv.id).toBe("post-1");
    expect(createBeehiivDraftMock).toHaveBeenCalledTimes(1);

    const publishArgs = createBeehiivDraftMock.mock.calls[0][0] as {
      title: string;
      subtitle?: string;
      htmlContent: string;
    };
    expect(publishArgs.title).toBe("Identity <Shift>");
    expect(publishArgs.subtitle).toBe("Agents need guardrails");
    expect(publishArgs.htmlContent).toContain("&lt;Shift&gt;");
    expect(publishArgs.htmlContent).toContain("<strong>important</strong>");
  });
});
