import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabase, makeJsonRequest, makeRequest } from "./helpers";

const mockSupabase = createMockSupabase();

vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => mockSupabase,
}));

import { DELETE as DELETE_BY_ID, PATCH } from "@/app/api/content-outlines/[id]/route";
import { GET, POST } from "@/app/api/content-outlines/route";

function routeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.stubEnv("WORKSPACE_ID", "ws-123");
  vi.clearAllMocks();
});

describe("GET /api/content-outlines", () => {
  it("filters out disabled outlines by default", async () => {
    const chain = mockSupabase._setResult("content_outlines", {
      data: [
        {
          id: "outline-1",
          name: "Default newsletter issue",
          kind: "newsletter_issue",
          is_default: true,
          disabled_at: null,
          created_at: "2026-03-20T00:00:00.000Z",
          updated_at: "2026-03-20T00:00:00.000Z",
          spec_json: {
            version: 1,
            userPromptTemplate: "{{PRIMARY_THESIS}}",
            systemPromptSuffix: "rules",
          },
        },
      ],
      error: null,
    });

    const res = await GET(makeRequest("http://localhost:3000/api/content-outlines"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(chain.is).toHaveBeenCalledWith("disabled_at", null);
    expect(json.outlines).toEqual([
      expect.objectContaining({
        id: "outline-1",
        kind: "newsletter_issue",
        userPromptTemplate: "{{PRIMARY_THESIS}}",
      }),
    ]);
  });

  it("includes disabled outlines when includeDisabled=1 is set", async () => {
    const chain = mockSupabase._setResult("content_outlines", {
      data: [],
      error: null,
    });

    const res = await GET(makeRequest("http://localhost:3000/api/content-outlines?includeDisabled=1"));

    expect(res.status).toBe(200);
    expect(chain.is).not.toHaveBeenCalled();
  });
});

describe("POST /api/content-outlines", () => {
  it("returns 400 for invalid payloads before touching DB", async () => {
    const req = makeJsonRequest("http://localhost:3000/api/content-outlines", {
      kind: "newsletter_issue",
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("name is required");
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  it("clears existing defaults for kind when saving a new default", async () => {
    const chain = mockSupabase._setResult("content_outlines", {
      data: {
        id: "outline-new",
        name: "Custom newsletter",
        kind: "newsletter_issue",
        is_default: true,
        disabled_at: null,
        created_at: "2026-03-20T00:00:00.000Z",
        updated_at: "2026-03-20T00:00:00.000Z",
        spec_json: {
          version: 1,
          userPromptTemplate: "{{PRIMARY_THESIS}}",
          systemPromptSuffix: "",
        },
      },
      error: null,
    });

    const req = makeJsonRequest("http://localhost:3000/api/content-outlines", {
      name: "  Custom newsletter  ",
      kind: "newsletter_issue",
      is_default: true,
      userPromptTemplate: "{{PRIMARY_THESIS}}",
      systemPromptSuffix: "",
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(chain.update).toHaveBeenCalledWith({ is_default: false });
    expect(chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        workspace_id: "ws-123",
        name: "Custom newsletter",
        kind: "newsletter_issue",
        is_default: true,
        disabled_at: null,
      })
    );
    expect(json.warnings.length).toBeGreaterThan(0);
  });
});

describe("PATCH /api/content-outlines/[id]", () => {
  it("rejects edits for disabled outlines", async () => {
    const chain = mockSupabase._setResult("content_outlines", { data: null, error: null });
    chain.maybeSingle = vi.fn().mockResolvedValue({
      data: {
        id: "outline-1",
        name: "Disabled outline",
        kind: "newsletter_issue",
        is_default: false,
        disabled_at: "2026-03-20T00:00:00.000Z",
        spec_json: {
          version: 1,
          userPromptTemplate: "{{PRIMARY_THESIS}}",
          systemPromptSuffix: "suffix",
        },
      },
      error: null,
    });

    const req = makeJsonRequest("http://localhost:3000/api/content-outlines/outline-1", {
      name: "Attempted rename",
    });
    const res = await PATCH(req, routeParams("outline-1"));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toContain("disabled outline");
    expect(chain.update).not.toHaveBeenCalled();
  });

  it("clears defaults and updates fields when setting is_default=true", async () => {
    const chain = mockSupabase._setResult("content_outlines", { data: null, error: null });
    chain.maybeSingle = vi.fn().mockResolvedValue({
      data: {
        id: "outline-1",
        name: "Old name",
        kind: "newsletter_issue",
        is_default: false,
        disabled_at: null,
        spec_json: {
          version: 1,
          userPromptTemplate:
            "{{PRIMARY_THESIS}} {{STEERING_BLOCK}} {{ANGLE_BLOCK}} {{LEADS_BLOCK}} {{PROMO_TEXT}}",
          systemPromptSuffix: "suffix",
        },
      },
      error: null,
    });
    chain.single = vi.fn().mockResolvedValue({
      data: {
        id: "outline-1",
        name: "New name",
        kind: "newsletter_issue",
        is_default: true,
        disabled_at: null,
        created_at: "2026-03-20T00:00:00.000Z",
        updated_at: "2026-03-20T00:01:00.000Z",
        spec_json: {
          version: 1,
          userPromptTemplate:
            "{{PRIMARY_THESIS}} {{STEERING_BLOCK}} {{ANGLE_BLOCK}} {{LEADS_BLOCK}} {{PROMO_TEXT}}",
          systemPromptSuffix: "suffix",
        },
      },
      error: null,
    });

    const req = makeJsonRequest("http://localhost:3000/api/content-outlines/outline-1", {
      name: "New name",
      is_default: true,
    });
    const res = await PATCH(req, routeParams("outline-1"));

    expect(res.status).toBe(200);
    expect(chain.update).toHaveBeenCalledTimes(2);
    expect(chain.update.mock.calls[0]?.[0]).toEqual({ is_default: false });
    expect(chain.update.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        name: "New name",
        is_default: true,
      })
    );
  });
});

describe("DELETE /api/content-outlines/[id]", () => {
  it("soft-disables outlines and clears default flag", async () => {
    const chain = mockSupabase._setResult("content_outlines", { data: null, error: null });
    chain.maybeSingle = vi.fn().mockResolvedValue({
      data: { id: "outline-1", disabled_at: null },
      error: null,
    });

    const res = await DELETE_BY_ID(
      makeRequest("http://localhost:3000/api/content-outlines/outline-1", { method: "DELETE" }),
      routeParams("outline-1")
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(chain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        is_default: false,
      })
    );
    expect(chain.eq).toHaveBeenCalledWith("id", "outline-1");
  });
});
