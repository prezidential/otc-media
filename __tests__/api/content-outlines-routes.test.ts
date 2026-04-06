import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabase, makeJsonRequest, makeRequest } from "./helpers";
import { DEFAULT_NEWSLETTER_OUTLINE } from "@/lib/content-outlines/default-specs";

const mockSupabase = createMockSupabase();

vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => mockSupabase,
}));

import { GET as listOutlines, POST as createOutline } from "@/app/api/content-outlines/route";
import {
  PATCH as updateOutlineById,
  DELETE as disableOutlineById,
} from "@/app/api/content-outlines/[id]/route";

beforeEach(() => {
  vi.stubEnv("WORKSPACE_ID", "ws-123");
  vi.clearAllMocks();
});

describe("GET /api/content-outlines", () => {
  it("excludes disabled outlines by default", async () => {
    const chain = mockSupabase._setResult("content_outlines", { data: [], error: null });

    const res = await listOutlines(makeRequest("http://localhost:3000/api/content-outlines"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.outlines).toEqual([]);
    expect(chain.is).toHaveBeenCalledWith("disabled_at", null);
  });

  it("includes disabled outlines when includeDisabled=1", async () => {
    const chain = mockSupabase._setResult("content_outlines", { data: [], error: null });

    const res = await listOutlines(
      makeRequest("http://localhost:3000/api/content-outlines?includeDisabled=1")
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.outlines).toEqual([]);
    expect(chain.is).not.toHaveBeenCalledWith("disabled_at", null);
  });
});

describe("POST /api/content-outlines", () => {
  it("clears existing defaults when creating a new default outline", async () => {
    const inserted = {
      id: "new-outline",
      name: "New default",
      kind: "newsletter_issue",
      is_default: true,
      disabled_at: null,
      created_at: "2026-04-01T00:00:00Z",
      updated_at: "2026-04-01T00:00:00Z",
      spec_json: DEFAULT_NEWSLETTER_OUTLINE,
    };
    const chain = mockSupabase._setResult("content_outlines", { data: inserted, error: null });

    const req = makeJsonRequest("http://localhost:3000/api/content-outlines", {
      name: "New default",
      kind: "newsletter_issue",
      is_default: true,
      userPromptTemplate: DEFAULT_NEWSLETTER_OUTLINE.userPromptTemplate,
      systemPromptSuffix: DEFAULT_NEWSLETTER_OUTLINE.systemPromptSuffix,
    });
    const res = await createOutline(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.outline.id).toBe("new-outline");
    expect(chain.update).toHaveBeenCalledWith({ is_default: false });
    expect(chain.eq).toHaveBeenCalledWith("workspace_id", "ws-123");
    expect(chain.eq).toHaveBeenCalledWith("kind", "newsletter_issue");
  });
});

describe("PATCH /api/content-outlines/[id]", () => {
  const routeParams = { params: Promise.resolve({ id: "outline-1" }) };

  it("returns 400 when trying to change kind", async () => {
    const existing = {
      id: "outline-1",
      name: "Current name",
      kind: "newsletter_issue",
      is_default: false,
      disabled_at: null,
      spec_json: DEFAULT_NEWSLETTER_OUTLINE,
    };
    const chain = mockSupabase._setResult("content_outlines", { data: existing, error: null });

    const req = makeJsonRequest("http://localhost:3000/api/content-outlines/outline-1", {
      kind: "insider_access",
    });
    const res = await updateOutlineById(req, routeParams);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("kind cannot be changed");
    expect(chain.update).not.toHaveBeenCalled();
  });

  it("returns 400 when trying to edit a disabled outline", async () => {
    const existing = {
      id: "outline-1",
      name: "Disabled outline",
      kind: "newsletter_issue",
      is_default: false,
      disabled_at: "2026-04-01T00:00:00Z",
      spec_json: DEFAULT_NEWSLETTER_OUTLINE,
    };
    const chain = mockSupabase._setResult("content_outlines", { data: existing, error: null });

    const req = makeJsonRequest("http://localhost:3000/api/content-outlines/outline-1", {
      name: "Should fail",
    });
    const res = await updateOutlineById(req, routeParams);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("Cannot edit a disabled outline.");
    expect(chain.update).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/content-outlines/[id]", () => {
  const routeParams = { params: Promise.resolve({ id: "outline-1" }) };

  it("returns 400 when outline is already disabled", async () => {
    const existing = { id: "outline-1", disabled_at: "2026-04-01T00:00:00Z" };
    const chain = mockSupabase._setResult("content_outlines", { data: existing, error: null });

    const res = await disableOutlineById(
      makeRequest("http://localhost:3000/api/content-outlines/outline-1", { method: "DELETE" }),
      routeParams
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("Outline is already disabled.");
    expect(chain.update).not.toHaveBeenCalled();
  });

  it("soft-disables outline and clears default flag", async () => {
    const existing = { id: "outline-1", disabled_at: null };
    const chain = mockSupabase._setResult("content_outlines", { data: existing, error: null });

    const res = await disableOutlineById(
      makeRequest("http://localhost:3000/api/content-outlines/outline-1", { method: "DELETE" }),
      routeParams
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(chain.update).toHaveBeenCalledTimes(1);
    expect(chain.eq).toHaveBeenCalledWith("workspace_id", "ws-123");
    expect(chain.eq).toHaveBeenCalledWith("id", "outline-1");
  });
});
