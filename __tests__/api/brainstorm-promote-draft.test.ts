import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabase, makeJsonRequest } from "./helpers";

const mockSupabase = createMockSupabase();
const mockPromote = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => mockSupabase,
}));

vi.mock("@/lib/brainstorm/promote-to-issue", () => ({
  promoteBrainstormSessionToIssueDraft: (...args: unknown[]) => mockPromote(...args),
}));

import { POST } from "@/app/api/brainstorm/sessions/[id]/promote-draft/route";

function params(id = "session-1") {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("WORKSPACE_ID", "ws-123");
});

describe("POST /api/brainstorm/sessions/[id]/promote-draft", () => {
  it("returns 400 when there is no brand profile on session and no override in request", async () => {
    mockSupabase._setResult("brainstorm_sessions", {
      data: { id: "session-1", brand_profile_id: null, artifact_json: {} },
      error: null,
    });

    const res = await POST(makeJsonRequest("http://localhost/api/brainstorm/sessions/session-1/promote-draft", {}), params());
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toContain("brandProfileId is required");
    expect(mockPromote).not.toHaveBeenCalled();
  });

  it("returns 404 when override brand profile is not found", async () => {
    mockSupabase._setResult("brainstorm_sessions", {
      data: { id: "session-1", brand_profile_id: null, artifact_json: {} },
      error: null,
    });
    mockSupabase._setResult("brand_profiles", {
      data: null,
      error: null,
    });

    const res = await POST(
      makeJsonRequest("http://localhost/api/brainstorm/sessions/session-1/promote-draft", {
        brandProfileId: "bp-missing",
      }),
      params()
    );
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error).toBe("Brand profile not found");
    expect(mockPromote).not.toHaveBeenCalled();
  });

  it("uses override brand profile and sanitized artifact object when promotion succeeds", async () => {
    mockSupabase._setResult("brainstorm_sessions", {
      data: {
        id: "session-1",
        brand_profile_id: "bp-session",
        artifact_json: [],
      },
      error: null,
    });
    mockSupabase._setResult("brand_profiles", {
      data: { id: "bp-override" },
      error: null,
    });
    mockPromote.mockResolvedValue({ draftId: "draft-123" });

    const res = await POST(
      makeJsonRequest("http://localhost/api/brainstorm/sessions/session-1/promote-draft", {
        brandProfileId: "bp-override",
      }),
      params()
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ ok: true, draftId: "draft-123" });
    expect(mockPromote).toHaveBeenCalledWith({
      supabase: mockSupabase,
      workspaceId: "ws-123",
      sessionId: "session-1",
      artifactJson: {},
      brandProfileId: "bp-override",
    });
  });

  it("returns 500 with promotion error message when helper throws", async () => {
    const artifact = { working_artifact: { thesis: "Ship test coverage safely" } };
    mockSupabase._setResult("brainstorm_sessions", {
      data: {
        id: "session-1",
        brand_profile_id: "bp-session",
        artifact_json: artifact,
      },
      error: null,
    });
    mockSupabase._setResult("brand_profiles", {
      data: { id: "bp-session" },
      error: null,
    });
    mockPromote.mockRejectedValue(new Error("Nothing to promote"));

    const res = await POST(makeJsonRequest("http://localhost/api/brainstorm/sessions/session-1/promote-draft", {}), params());
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toBe("Nothing to promote");
    expect(mockPromote).toHaveBeenCalledWith({
      supabase: mockSupabase,
      workspaceId: "ws-123",
      sessionId: "session-1",
      artifactJson: artifact,
      brandProfileId: "bp-session",
    });
  });
});
