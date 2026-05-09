import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabase, makeJsonRequest } from "./helpers";

const { promoteBrainstormSessionToIssueDraftMock } = vi.hoisted(() => ({
  promoteBrainstormSessionToIssueDraftMock: vi.fn(),
}));

const mockSupabase = createMockSupabase();

vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => mockSupabase,
}));

vi.mock("@/lib/brainstorm/promote-to-issue", () => ({
  promoteBrainstormSessionToIssueDraft: (...args: unknown[]) =>
    promoteBrainstormSessionToIssueDraftMock(...args),
}));

import { POST } from "@/app/api/brainstorm/sessions/[id]/promote-draft/route";

function routeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("WORKSPACE_ID", "ws-123");
});

describe("POST /api/brainstorm/sessions/[id]/promote-draft", () => {
  it("returns 500 when WORKSPACE_ID is missing", async () => {
    vi.stubEnv("WORKSPACE_ID", "");

    const req = makeJsonRequest("http://localhost:3000/api/brainstorm/sessions/sess-1/promote-draft", {});
    const res = await POST(req, routeParams("sess-1"));
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toContain("WORKSPACE_ID");
  });

  it("returns 400 when session has no brand profile and no override is provided", async () => {
    const sessionChain = mockSupabase._setResult("brainstorm_sessions", { data: null, error: null });
    sessionChain.maybeSingle.mockResolvedValueOnce({
      data: {
        id: "sess-1",
        brand_profile_id: null,
        artifact_json: {},
      },
      error: null,
    });

    const req = makeJsonRequest("http://localhost:3000/api/brainstorm/sessions/sess-1/promote-draft", {});
    const res = await POST(req, routeParams("sess-1"));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toContain("brandProfileId is required");
    expect(promoteBrainstormSessionToIssueDraftMock).not.toHaveBeenCalled();
  });

  it("returns 404 when chosen brand profile is not in the workspace", async () => {
    const sessionChain = mockSupabase._setResult("brainstorm_sessions", { data: null, error: null });
    sessionChain.maybeSingle.mockResolvedValueOnce({
      data: {
        id: "sess-1",
        brand_profile_id: "bp-1",
        artifact_json: { working_artifact: { thesis: "x" } },
      },
      error: null,
    });

    const brandChain = mockSupabase._setResult("brand_profiles", { data: null, error: null });
    brandChain.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const req = makeJsonRequest("http://localhost:3000/api/brainstorm/sessions/sess-1/promote-draft", {});
    const res = await POST(req, routeParams("sess-1"));
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error).toBe("Brand profile not found");
    expect(promoteBrainstormSessionToIssueDraftMock).not.toHaveBeenCalled();
  });

  it("uses brand override, normalizes artifact_json, and returns promoted draft id", async () => {
    const sessionChain = mockSupabase._setResult("brainstorm_sessions", { data: null, error: null });
    sessionChain.maybeSingle.mockResolvedValueOnce({
      data: {
        id: "sess-1",
        brand_profile_id: "bp-old",
        artifact_json: ["not-an-object"],
      },
      error: null,
    });

    const brandChain = mockSupabase._setResult("brand_profiles", { data: null, error: null });
    brandChain.maybeSingle.mockResolvedValueOnce({
      data: { id: "bp-new" },
      error: null,
    });

    promoteBrainstormSessionToIssueDraftMock.mockResolvedValueOnce({ draftId: "draft-7" });

    const req = makeJsonRequest("http://localhost:3000/api/brainstorm/sessions/sess-1/promote-draft", {
      brandProfileId: "  bp-new  ",
    });
    const res = await POST(req, routeParams("sess-1"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ ok: true, draftId: "draft-7" });
    expect(promoteBrainstormSessionToIssueDraftMock).toHaveBeenCalledWith({
      supabase: mockSupabase,
      workspaceId: "ws-123",
      sessionId: "sess-1",
      artifactJson: {},
      brandProfileId: "bp-new",
    });
  });
});
