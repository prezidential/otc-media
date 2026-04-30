import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabase, makeJsonRequest } from "./helpers";

const { promoteMock } = vi.hoisted(() => ({
  promoteMock: vi.fn(),
}));

const mockSupabase = createMockSupabase();

vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => mockSupabase,
}));

vi.mock("@/lib/brainstorm/promote-to-issue", () => ({
  promoteBrainstormSessionToIssueDraft: promoteMock,
}));

import { POST } from "@/app/api/brainstorm/sessions/[id]/promote-draft/route";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("WORKSPACE_ID", "ws-123");
});

describe("POST /api/brainstorm/sessions/[id]/promote-draft", () => {
  it("requires a brand profile when the session has no profile and no override is provided", async () => {
    mockSupabase._setResult("brainstorm_sessions", {
      data: {
        id: "session-1",
        brand_profile_id: null,
        artifact_json: { working_artifact: { thesis: "Identity story" } },
      },
      error: null,
    });

    const res = await POST(makeJsonRequest("http://localhost/api/brainstorm/sessions/session-1/promote-draft", {}), {
      params: Promise.resolve({ id: "session-1" }),
    });
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toContain("brandProfileId is required");
    expect(promoteMock).not.toHaveBeenCalled();
  });

  it("returns 404 before promotion when the chosen brand profile does not exist", async () => {
    mockSupabase._setResult("brainstorm_sessions", {
      data: {
        id: "session-1",
        brand_profile_id: "brand-from-session",
        artifact_json: { working_artifact: { thesis: "Identity story" } },
      },
      error: null,
    });
    mockSupabase._setResult("brand_profiles", { data: null, error: null });

    const res = await POST(makeJsonRequest("http://localhost/api/brainstorm/sessions/session-1/promote-draft", {}), {
      params: Promise.resolve({ id: "session-1" }),
    });
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error).toBe("Brand profile not found");
    expect(promoteMock).not.toHaveBeenCalled();
  });

  it("promotes with the request brand override and normalizes non-object artifacts", async () => {
    const brainstormChain = mockSupabase._setResult("brainstorm_sessions", {
      data: {
        id: "session-1",
        brand_profile_id: "brand-from-session",
        artifact_json: "legacy-bad-shape",
      },
      error: null,
    });
    const brandChain = mockSupabase._setResult("brand_profiles", {
      data: { id: "brand-override" },
      error: null,
    });
    promoteMock.mockResolvedValueOnce({ draftId: "draft-1", contentJson: {} });

    const res = await POST(
      makeJsonRequest("http://localhost/api/brainstorm/sessions/session-1/promote-draft", {
        brandProfileId: "  brand-override  ",
      }),
      { params: Promise.resolve({ id: "session-1" }) }
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ ok: true, draftId: "draft-1" });
    expect(brainstormChain.eq).toHaveBeenCalledWith("workspace_id", "ws-123");
    expect(brainstormChain.eq).toHaveBeenCalledWith("id", "session-1");
    expect(brandChain.eq).toHaveBeenCalledWith("id", "brand-override");
    expect(promoteMock).toHaveBeenCalledWith({
      supabase: mockSupabase,
      workspaceId: "ws-123",
      sessionId: "session-1",
      artifactJson: {},
      brandProfileId: "brand-override",
    });
  });
});
