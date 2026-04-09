import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabase, makeJsonRequest, makeRequest } from "./helpers";
import { DEFAULT_INSIDER_OUTLINE, DEFAULT_NEWSLETTER_OUTLINE } from "@/lib/content-outlines/default-specs";

const mockSupabase = createMockSupabase();

vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => mockSupabase,
}));

import { GET as GET_OUTLINES, POST as POST_OUTLINES } from "@/app/api/content-outlines/route";
import { DELETE, PATCH } from "@/app/api/content-outlines/[id]/route";

function makeOutlineRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "outline-1",
    name: "Default newsletter issue",
    kind: "newsletter_issue",
    is_default: true,
    disabled_at: null,
    created_at: "2026-04-01T00:00:00.000Z",
    updated_at: "2026-04-01T00:00:00.000Z",
    spec_json: DEFAULT_NEWSLETTER_OUTLINE,
    ...overrides,
  };
}

beforeEach(() => {
  vi.stubEnv("WORKSPACE_ID", "ws-123");
  vi.clearAllMocks();
});

describe("GET /api/content-outlines", () => {
  it("filters out disabled outlines by default", async () => {
    const chain = mockSupabase._setResult("content_outlines", {
      data: [makeOutlineRow()],
      error: null,
    });

    const req = makeRequest("http://localhost:3000/api/content-outlines");
    const res = await GET_OUTLINES(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(chain.is).toHaveBeenCalledWith("disabled_at", null);
    expect(json.outlines).toEqual([
      expect.objectContaining({
        id: "outline-1",
        name: "Default newsletter issue",
        kind: "newsletter_issue",
      }),
    ]);
  });

  it("includes disabled outlines when includeDisabled=1", async () => {
    const chain = mockSupabase._setResult("content_outlines", {
      data: [makeOutlineRow({ disabled_at: "2026-04-08T00:00:00.000Z" })],
      error: null,
    });

    const req = makeRequest("http://localhost:3000/api/content-outlines?includeDisabled=1");
    const res = await GET_OUTLINES(req);

    expect(res.status).toBe(200);
    expect(chain.is).not.toHaveBeenCalled();
  });
});

describe("POST /api/content-outlines", () => {
  it("rejects insider outline creation without insiderSystemPrompt", async () => {
    const req = makeJsonRequest("http://localhost:3000/api/content-outlines", {
      name: "Insider",
      kind: "insider_access",
      userPromptTemplate: DEFAULT_INSIDER_OUTLINE.userPromptTemplate,
      is_default: false,
    });
    const res = await POST_OUTLINES(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toContain("insiderSystemPrompt is required");
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  it("clears existing defaults for kind when creating a new default outline", async () => {
    const inserted = makeOutlineRow({
      id: "outline-2",
      name: "My Default",
      is_default: true,
      spec_json: {
        version: 1,
        userPromptTemplate: DEFAULT_NEWSLETTER_OUTLINE.userPromptTemplate,
        systemPromptSuffix: DEFAULT_NEWSLETTER_OUTLINE.systemPromptSuffix,
      },
    });
    const chain = mockSupabase._setResult("content_outlines", {
      data: inserted,
      error: null,
    });

    const req = makeJsonRequest("http://localhost:3000/api/content-outlines", {
      name: "My Default",
      kind: "newsletter_issue",
      userPromptTemplate: DEFAULT_NEWSLETTER_OUTLINE.userPromptTemplate,
      systemPromptSuffix: DEFAULT_NEWSLETTER_OUTLINE.systemPromptSuffix,
      is_default: true,
    });
    const res = await POST_OUTLINES(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(chain.update).toHaveBeenCalledWith({ is_default: false });
    expect(chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        workspace_id: "ws-123",
        name: "My Default",
        kind: "newsletter_issue",
        is_default: true,
        disabled_at: null,
      })
    );
    expect(json.outline).toEqual(
      expect.objectContaining({
        id: "outline-2",
        name: "My Default",
        kind: "newsletter_issue",
        is_default: true,
      })
    );
  });
});

describe("PATCH /api/content-outlines/[id]", () => {
  it("rejects updates when trying to change outline kind", async () => {
    const chain = mockSupabase._setResult("content_outlines", {
      data: makeOutlineRow({ is_default: false }),
      error: null,
    });

    const req = makeJsonRequest("http://localhost:3000/api/content-outlines/outline-1", {
      kind: "insider_access",
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "outline-1" }) });
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("kind cannot be changed");
    expect(chain.update).not.toHaveBeenCalled();
  });

  it("blocks edits for disabled outlines", async () => {
    const chain = mockSupabase._setResult("content_outlines", {
      data: makeOutlineRow({ disabled_at: "2026-04-08T00:00:00.000Z" }),
      error: null,
    });

    const req = makeJsonRequest("http://localhost:3000/api/content-outlines/outline-1", {
      name: "Rename",
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "outline-1" }) });
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("Cannot edit a disabled outline.");
    expect(chain.update).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/content-outlines/[id]", () => {
  it("soft-disables active outlines", async () => {
    const chain = mockSupabase._setResult("content_outlines", {
      data: { id: "outline-1", disabled_at: null },
      error: null,
    });

    const req = makeRequest("http://localhost:3000/api/content-outlines/outline-1", {
      method: "DELETE",
    });
    const res = await DELETE(req, { params: Promise.resolve({ id: "outline-1" }) });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(chain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        is_default: false,
        disabled_at: expect.any(String),
        updated_at: expect.any(String),
      })
    );
  });

  it("returns 400 when outline is already disabled", async () => {
    const chain = mockSupabase._setResult("content_outlines", {
      data: { id: "outline-1", disabled_at: "2026-04-08T00:00:00.000Z" },
      error: null,
    });

    const req = makeRequest("http://localhost:3000/api/content-outlines/outline-1", {
      method: "DELETE",
    });
    const res = await DELETE(req, { params: Promise.resolve({ id: "outline-1" }) });
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("Outline is already disabled.");
    expect(chain.update).not.toHaveBeenCalled();
  });
});
