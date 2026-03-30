import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabase, makeJsonRequest, makeRequest } from "./helpers";

const mockSupabase = createMockSupabase();

vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => mockSupabase,
}));

import { GET as listOutlines, POST as createOutline } from "@/app/api/content-outlines/route";
import {
  DELETE as disableOutline,
  GET as getOutlineById,
  PATCH as updateOutline,
} from "@/app/api/content-outlines/[id]/route";

function routeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

function makePatchRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.stubEnv("WORKSPACE_ID", "ws-123");
  vi.clearAllMocks();
});

describe("GET /api/content-outlines", () => {
  it("filters disabled outlines by default and serializes spec_json", async () => {
    const chain = mockSupabase._setResult("content_outlines", {
      data: [
        {
          id: "outline-1",
          name: "Default newsletter issue",
          kind: "newsletter_issue",
          is_default: true,
          disabled_at: null,
          created_at: "2026-03-20T00:00:00Z",
          updated_at: "2026-03-21T00:00:00Z",
          spec_json: {
            version: 1,
            userPromptTemplate: "Custom {{PRIMARY_THESIS}}",
            systemPromptSuffix: "Suffix rules",
          },
        },
      ],
      error: null,
    });

    const req = makeRequest("http://localhost:3000/api/content-outlines");
    const res = await listOutlines(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(chain.is).toHaveBeenCalledWith("disabled_at", null);
    expect(json.outlines).toEqual([
      expect.objectContaining({
        id: "outline-1",
        kind: "newsletter_issue",
        userPromptTemplate: "Custom {{PRIMARY_THESIS}}",
        systemPromptSuffix: "Suffix rules",
      }),
    ]);
  });

  it("skips disabled filter when includeDisabled=1", async () => {
    const chain = mockSupabase._setResult("content_outlines", {
      data: [],
      error: null,
    });

    const req = makeRequest("http://localhost:3000/api/content-outlines?includeDisabled=1");
    const res = await listOutlines(req);

    expect(res.status).toBe(200);
    expect(chain.is).not.toHaveBeenCalled();
  });
});

describe("POST /api/content-outlines", () => {
  it("creates outline, clears prior defaults, and returns warnings", async () => {
    const chain = mockSupabase._setResult("content_outlines", {
      data: {
        id: "outline-created",
        name: "Operator issue",
        kind: "newsletter_issue",
        is_default: true,
        disabled_at: null,
        created_at: "2026-03-22T00:00:00Z",
        updated_at: "2026-03-22T00:00:00Z",
        spec_json: {
          version: 1,
          userPromptTemplate: "{{PRIMARY_THESIS}} only",
          systemPromptSuffix: "Tail rules",
        },
      },
      error: null,
    });

    const req = makeJsonRequest("http://localhost:3000/api/content-outlines", {
      name: "Operator issue",
      kind: "newsletter_issue",
      userPromptTemplate: "{{PRIMARY_THESIS}} only",
      systemPromptSuffix: "Tail rules",
      is_default: true,
    });
    const res = await createOutline(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(chain.update).toHaveBeenCalledWith({ is_default: false });
    expect(chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        workspace_id: "ws-123",
        name: "Operator issue",
        kind: "newsletter_issue",
        is_default: true,
        disabled_at: null,
      })
    );
    expect(json.outline.id).toBe("outline-created");
    expect(json.warnings.some((warning: string) => warning.includes("STEERING_BLOCK"))).toBe(true);
  });

  it("returns 400 for invalid form payload", async () => {
    const req = makeJsonRequest("http://localhost:3000/api/content-outlines", {
      name: "",
      kind: "newsletter_issue",
      userPromptTemplate: "template",
      systemPromptSuffix: "suffix",
    });

    const res = await createOutline(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toContain("name");
    const chain = mockSupabase._chains.get("content_outlines");
    expect(chain?.insert).not.toHaveBeenCalled();
  });
});

describe("GET/PATCH/DELETE /api/content-outlines/[id]", () => {
  it("returns one outline by id", async () => {
    mockSupabase._setResult("content_outlines", {
      data: {
        id: "outline-1",
        name: "Insider Default",
        kind: "insider_access",
        is_default: false,
        disabled_at: null,
        created_at: "2026-03-20T00:00:00Z",
        updated_at: "2026-03-20T00:00:00Z",
        spec_json: {
          version: 1,
          userPromptTemplate: "Inside {{PRIMARY_THESIS}}",
          systemPromptTemplate: "Insider system",
        },
      },
      error: null,
    });

    const res = await getOutlineById(makeRequest("http://localhost:3000/api/content-outlines/outline-1"), routeParams("outline-1"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.outline).toEqual(
      expect.objectContaining({
        id: "outline-1",
        kind: "insider_access",
        insiderSystemPrompt: "Insider system",
      })
    );
  });

  it("rejects kind changes during patch", async () => {
    const chain = mockSupabase._setResult("content_outlines", { data: null, error: null });
    chain.maybeSingle = vi.fn().mockResolvedValue({
      data: {
        id: "outline-1",
        name: "Newsletter",
        kind: "newsletter_issue",
        is_default: false,
        disabled_at: null,
        spec_json: {
          version: 1,
          userPromptTemplate: "{{PRIMARY_THESIS}}",
          systemPromptSuffix: "tail",
        },
      },
      error: null,
    });

    const req = makePatchRequest("http://localhost:3000/api/content-outlines/outline-1", {
      kind: "insider_access",
    });
    const res = await updateOutline(req, routeParams("outline-1"));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toContain("kind cannot be changed");
    expect(chain.update).not.toHaveBeenCalled();
  });

  it("updates active outline and emits warnings for missing placeholders", async () => {
    const chain = mockSupabase._setResult("content_outlines", { data: null, error: null });
    chain.maybeSingle = vi.fn().mockResolvedValue({
      data: {
        id: "outline-1",
        name: "Newsletter",
        kind: "newsletter_issue",
        is_default: false,
        disabled_at: null,
        spec_json: {
          version: 1,
          userPromptTemplate:
            "{{PRIMARY_THESIS}} {{STEERING_BLOCK}} {{ANGLE_BLOCK}} {{LEADS_BLOCK}} {{PROMO_TEXT}}",
          systemPromptSuffix: "tail",
        },
      },
      error: null,
    });
    chain.single = vi.fn().mockResolvedValue({
      data: {
        id: "outline-1",
        name: "Newsletter v2",
        kind: "newsletter_issue",
        is_default: true,
        disabled_at: null,
        created_at: "2026-03-20T00:00:00Z",
        updated_at: "2026-03-22T00:00:00Z",
        spec_json: {
          version: 1,
          userPromptTemplate: "{{PRIMARY_THESIS}}",
          systemPromptSuffix: "tail",
        },
      },
      error: null,
    });

    const req = makePatchRequest("http://localhost:3000/api/content-outlines/outline-1", {
      name: "Newsletter v2",
      is_default: true,
      userPromptTemplate: "{{PRIMARY_THESIS}}",
    });
    const res = await updateOutline(req, routeParams("outline-1"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.outline).toEqual(
      expect.objectContaining({
        id: "outline-1",
        name: "Newsletter v2",
        is_default: true,
      })
    );
    expect(json.warnings.length).toBeGreaterThan(0);
    expect(json.warnings.some((warning: string) => warning.includes("STEERING_BLOCK"))).toBe(true);

    const updateCalls = vi.mocked(chain.update).mock.calls;
    expect(updateCalls[0][0]).toEqual({ is_default: false });
    expect(updateCalls[1][0]).toMatchObject({
      name: "Newsletter v2",
      is_default: true,
    });
    expect(chain.is).toHaveBeenCalledWith("disabled_at", null);
  });

  it("soft-disables active outlines and clears default flag", async () => {
    const chain = mockSupabase._setResult("content_outlines", { data: null, error: null });
    chain.maybeSingle = vi.fn().mockResolvedValue({
      data: { id: "outline-1", disabled_at: null },
      error: null,
    });

    const req = makeRequest("http://localhost:3000/api/content-outlines/outline-1", {
      method: "DELETE",
    });
    const res = await disableOutline(req, routeParams("outline-1"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(chain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        is_default: false,
      })
    );
  });
});
