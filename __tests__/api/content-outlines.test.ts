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

const NEWSLETTER_ROW = {
  id: "outline-1",
  name: "Default newsletter issue",
  kind: "newsletter_issue",
  is_default: true,
  disabled_at: null,
  created_at: "2026-03-01T00:00:00.000Z",
  updated_at: "2026-03-01T00:00:00.000Z",
  spec_json: {
    version: 1,
    userPromptTemplate: "Custom {{PRIMARY_THESIS}} {{STEERING_BLOCK}}",
    systemPromptSuffix: "suffix",
  },
};

function idParams(id: string) {
  return { params: Promise.resolve({ id }) } as { params: Promise<{ id: string }> };
}

beforeEach(() => {
  vi.stubEnv("WORKSPACE_ID", "ws-123");
  vi.clearAllMocks();
});

describe("GET /api/content-outlines", () => {
  it("filters disabled outlines by default", async () => {
    const chain = mockSupabase._setResult("content_outlines", { data: [NEWSLETTER_ROW], error: null });

    const res = await listOutlines(makeRequest("http://localhost:3000/api/content-outlines"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(chain.is).toHaveBeenCalledWith("disabled_at", null);
    expect(json.outlines).toEqual([
      expect.objectContaining({
        id: "outline-1",
        kind: "newsletter_issue",
        userPromptTemplate: "Custom {{PRIMARY_THESIS}} {{STEERING_BLOCK}}",
      }),
    ]);
  });

  it("includes disabled outlines when includeDisabled=1", async () => {
    const chain = mockSupabase._setResult("content_outlines", { data: [NEWSLETTER_ROW], error: null });

    const res = await listOutlines(
      makeRequest("http://localhost:3000/api/content-outlines?includeDisabled=1")
    );

    expect(res.status).toBe(200);
    expect(chain.is).not.toHaveBeenCalled();
  });
});

describe("POST /api/content-outlines", () => {
  it("clears previous defaults before inserting a new default", async () => {
    const insertedRow = {
      ...NEWSLETTER_ROW,
      id: "outline-2",
      name: "New default",
    };
    const chain = mockSupabase._setResult("content_outlines", { data: insertedRow, error: null });
    chain.single = vi.fn().mockResolvedValue({ data: insertedRow, error: null });

    const req = makeJsonRequest("http://localhost:3000/api/content-outlines", {
      name: "New default",
      kind: "newsletter_issue",
      is_default: true,
      userPromptTemplate:
        "Template {{PRIMARY_THESIS}} {{STEERING_BLOCK}} {{ANGLE_BLOCK}} {{LEADS_BLOCK}} {{PROMO_TEXT}}",
      systemPromptSuffix: "Suffix",
    });
    const res = await createOutline(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(chain.update).toHaveBeenCalledWith({ is_default: false });
    expect(chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        workspace_id: "ws-123",
        name: "New default",
        kind: "newsletter_issue",
        is_default: true,
      })
    );
    expect(json.outline.id).toBe("outline-2");
  });
});

describe("PATCH /api/content-outlines/[id]", () => {
  it("rejects edits when outline is already disabled", async () => {
    const chain = mockSupabase._setResult("content_outlines", { data: null, error: null });
    chain.maybeSingle = vi.fn().mockResolvedValue({
      data: { ...NEWSLETTER_ROW, disabled_at: "2026-03-20T00:00:00.000Z" },
      error: null,
    });

    const req = makeRequest("http://localhost:3000/api/content-outlines/outline-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Should fail" }),
    });
    const res = await updateOutline(req, idParams("outline-1"));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("Cannot edit a disabled outline.");
    expect(chain.update).not.toHaveBeenCalled();
  });

  it("rejects kind changes", async () => {
    const chain = mockSupabase._setResult("content_outlines", { data: null, error: null });
    chain.maybeSingle = vi.fn().mockResolvedValue({ data: NEWSLETTER_ROW, error: null });

    const req = makeRequest("http://localhost:3000/api/content-outlines/outline-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "insider_access" }),
    });
    const res = await updateOutline(req, idParams("outline-1"));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("kind cannot be changed");
    expect(chain.update).not.toHaveBeenCalled();
  });

  it("updates fields and enforces active-row guard on write", async () => {
    const chain = mockSupabase._setResult("content_outlines", { data: null, error: null });
    chain.maybeSingle = vi.fn().mockResolvedValue({ data: NEWSLETTER_ROW, error: null });
    chain.single = vi.fn().mockResolvedValue({
      data: {
        ...NEWSLETTER_ROW,
        name: "Updated name",
        spec_json: {
          version: 1,
          userPromptTemplate:
            "Updated {{PRIMARY_THESIS}} {{STEERING_BLOCK}} {{ANGLE_BLOCK}} {{LEADS_BLOCK}} {{PROMO_TEXT}}",
          systemPromptSuffix: "Updated suffix",
        },
      },
      error: null,
    });

    const req = makeRequest("http://localhost:3000/api/content-outlines/outline-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Updated name",
        is_default: true,
        userPromptTemplate:
          "Updated {{PRIMARY_THESIS}} {{STEERING_BLOCK}} {{ANGLE_BLOCK}} {{LEADS_BLOCK}} {{PROMO_TEXT}}",
        systemPromptSuffix: "Updated suffix",
      }),
    });
    const res = await updateOutline(req, idParams("outline-1"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(chain.update).toHaveBeenCalledTimes(2);
    expect(chain.is).toHaveBeenCalledWith("disabled_at", null);
    expect(json.outline.name).toBe("Updated name");
  });
});

describe("GET /api/content-outlines/[id]", () => {
  it("returns 404 when the outline does not exist", async () => {
    const chain = mockSupabase._setResult("content_outlines", { data: null, error: null });
    chain.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });

    const res = await getOutlineById(
      makeRequest("http://localhost:3000/api/content-outlines/missing"),
      idParams("missing")
    );
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error).toBe("Not found");
  });
});

describe("DELETE /api/content-outlines/[id]", () => {
  it("soft-disables an active outline", async () => {
    const chain = mockSupabase._setResult("content_outlines", { data: null, error: null });
    chain.maybeSingle = vi.fn().mockResolvedValue({
      data: { id: "outline-1", disabled_at: null },
      error: null,
    });

    const res = await disableOutline(
      makeRequest("http://localhost:3000/api/content-outlines/outline-1", { method: "DELETE" }),
      idParams("outline-1")
    );
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

  it("returns 400 when outline is already disabled", async () => {
    const chain = mockSupabase._setResult("content_outlines", { data: null, error: null });
    chain.maybeSingle = vi.fn().mockResolvedValue({
      data: { id: "outline-1", disabled_at: "2026-03-20T00:00:00.000Z" },
      error: null,
    });

    const res = await disableOutline(
      makeRequest("http://localhost:3000/api/content-outlines/outline-1", { method: "DELETE" }),
      idParams("outline-1")
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("Outline is already disabled.");
  });
});
