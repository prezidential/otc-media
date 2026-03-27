import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabase, makeJsonRequest, makeRequest } from "./helpers";

const mockSupabase = createMockSupabase();

vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => mockSupabase,
}));

import { GET as LIST_GET, POST as LIST_POST } from "@/app/api/content-outlines/route";
import { DELETE as ITEM_DELETE, PATCH as ITEM_PATCH } from "@/app/api/content-outlines/[id]/route";

function newsletterDbRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "outline-1",
    name: "Newsletter Outline",
    kind: "newsletter_issue",
    is_default: false,
    disabled_at: null,
    created_at: "2026-03-01T00:00:00Z",
    updated_at: "2026-03-01T00:00:00Z",
    spec_json: {
      version: 1,
      userPromptTemplate:
        "{{PRIMARY_THESIS}} {{STEERING_BLOCK}} {{ANGLE_BLOCK}} {{LEADS_BLOCK}} {{PROMO_TEXT}}",
      systemPromptSuffix: "suffix",
    },
    ...overrides,
  };
}

function routeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.stubEnv("WORKSPACE_ID", "ws-123");
  vi.clearAllMocks();
});

describe("Content outlines collection routes", () => {
  it("GET filters disabled outlines by default", async () => {
    const chain = mockSupabase._setResult("content_outlines", {
      data: [newsletterDbRow()],
      error: null,
    });

    const res = await LIST_GET(makeRequest("http://localhost:3000/api/content-outlines"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(chain.eq).toHaveBeenCalledWith("workspace_id", "ws-123");
    expect(chain.is).toHaveBeenCalledWith("disabled_at", null);
    expect(json.outlines).toEqual([
      expect.objectContaining({
        id: "outline-1",
        kind: "newsletter_issue",
        userPromptTemplate:
          "{{PRIMARY_THESIS}} {{STEERING_BLOCK}} {{ANGLE_BLOCK}} {{LEADS_BLOCK}} {{PROMO_TEXT}}",
        systemPromptSuffix: "suffix",
      }),
    ]);
  });

  it("GET includeDisabled=1 does not add disabled filter", async () => {
    const chain = mockSupabase._setResult("content_outlines", {
      data: [newsletterDbRow({ disabled_at: "2026-03-10T00:00:00Z" })],
      error: null,
    });

    const res = await LIST_GET(makeRequest("http://localhost:3000/api/content-outlines?includeDisabled=1"));
    expect(res.status).toBe(200);
    expect(chain.is).not.toHaveBeenCalled();
  });

  it("POST rejects invalid body with 400", async () => {
    const chain = mockSupabase._setResult("content_outlines", { data: null, error: null });
    const req = makeJsonRequest("http://localhost:3000/api/content-outlines", {
      kind: "newsletter_issue",
      userPromptTemplate: "x",
    });

    const res = await LIST_POST(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toContain("name is required");
    expect(chain.insert).not.toHaveBeenCalled();
  });

  it("POST clears existing defaults when creating new default outline", async () => {
    const inserted = newsletterDbRow({ name: "New Default", is_default: true });
    const chain = mockSupabase._setResult("content_outlines", { data: inserted, error: null });

    const req = makeJsonRequest("http://localhost:3000/api/content-outlines", {
      name: "New Default",
      kind: "newsletter_issue",
      is_default: true,
      userPromptTemplate:
        "{{PRIMARY_THESIS}} {{STEERING_BLOCK}} {{ANGLE_BLOCK}} {{LEADS_BLOCK}} {{PROMO_TEXT}}",
      systemPromptSuffix: "suffix",
    });

    const res = await LIST_POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(chain.update).toHaveBeenCalledWith({ is_default: false });
    expect(chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        workspace_id: "ws-123",
        name: "New Default",
        kind: "newsletter_issue",
        is_default: true,
        disabled_at: null,
      })
    );
    expect(json.outline).toEqual(expect.objectContaining({ id: "outline-1", is_default: true }));
  });
});

describe("Content outlines item routes", () => {
  it("PATCH rejects kind changes", async () => {
    const chain = mockSupabase._setResult("content_outlines", { data: null, error: null });
    chain.maybeSingle = vi.fn().mockResolvedValue({
      data: newsletterDbRow(),
      error: null,
    });

    const req = makeJsonRequest("http://localhost:3000/api/content-outlines/outline-1", {
      kind: "insider_access",
    });
    const res = await ITEM_PATCH(req, routeParams("outline-1"));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("kind cannot be changed");
    expect(chain.update).not.toHaveBeenCalled();
  });

  it("PATCH blocks editing a disabled outline", async () => {
    const chain = mockSupabase._setResult("content_outlines", { data: null, error: null });
    chain.maybeSingle = vi.fn().mockResolvedValue({
      data: newsletterDbRow({ disabled_at: "2026-03-02T00:00:00Z" }),
      error: null,
    });

    const req = makeJsonRequest("http://localhost:3000/api/content-outlines/outline-1", {
      name: "Renamed",
    });
    const res = await ITEM_PATCH(req, routeParams("outline-1"));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("Cannot edit a disabled outline.");
    expect(chain.update).not.toHaveBeenCalled();
  });

  it("PATCH with is_default=true clears prior defaults before update", async () => {
    const existing = newsletterDbRow();
    const updated = newsletterDbRow({
      name: "Renamed",
      is_default: true,
      updated_at: "2026-03-20T00:00:00Z",
    });
    const chain = mockSupabase._setResult("content_outlines", { data: null, error: null });
    chain.maybeSingle = vi.fn().mockResolvedValue({ data: existing, error: null });
    chain.single = vi.fn().mockResolvedValue({ data: updated, error: null });

    const req = makeJsonRequest("http://localhost:3000/api/content-outlines/outline-1", {
      name: "  Renamed  ",
      is_default: true,
      systemPromptSuffix: "  changed suffix  ",
    });
    const res = await ITEM_PATCH(req, routeParams("outline-1"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(chain.update.mock.calls[0][0]).toEqual({ is_default: false });
    expect(chain.update.mock.calls[1][0]).toEqual(
      expect.objectContaining({
        name: "Renamed",
        is_default: true,
        spec_json: expect.objectContaining({
          systemPromptSuffix: "changed suffix",
        }),
        updated_at: expect.any(String),
      })
    );
    expect(json.outline).toEqual(expect.objectContaining({ name: "Renamed", is_default: true }));
  });

  it("DELETE rejects already-disabled outlines", async () => {
    const chain = mockSupabase._setResult("content_outlines", { data: null, error: null });
    chain.maybeSingle = vi.fn().mockResolvedValue({
      data: { id: "outline-1", disabled_at: "2026-03-02T00:00:00Z" },
      error: null,
    });

    const res = await ITEM_DELETE(makeRequest("http://localhost:3000/api/content-outlines/outline-1"), routeParams("outline-1"));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("Outline is already disabled.");
    expect(chain.update).not.toHaveBeenCalled();
  });

  it("DELETE soft-disables active outlines", async () => {
    const chain = mockSupabase._setResult("content_outlines", { data: null, error: null });
    chain.maybeSingle = vi.fn().mockResolvedValue({
      data: { id: "outline-1", disabled_at: null },
      error: null,
    });

    const res = await ITEM_DELETE(makeRequest("http://localhost:3000/api/content-outlines/outline-1"), routeParams("outline-1"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(chain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        disabled_at: expect.any(String),
        is_default: false,
        updated_at: expect.any(String),
      })
    );
    expect(json.ok).toBe(true);
  });
});
