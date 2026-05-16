import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockSupabase } from "./helpers";

const mockSupabase = createMockSupabase();
const ctx = { supabase: mockSupabase, workspaceId: "ws-123", userId: "user-1", role: "owner" as const };
const { requireWorkspaceMock } = vi.hoisted(() => ({
  requireWorkspaceMock: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => mockSupabase,
  supabaseUser: async () => mockSupabase,
}));
vi.mock("@/lib/auth/session", () => ({
  requireWorkspace: requireWorkspaceMock,
}));

import { GET } from "@/app/api/issues/latest/route";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("WORKSPACE_ID", "ws-123");
  requireWorkspaceMock.mockImplementation(async () => ctx);
});

describe("GET /api/issues/latest", () => {
  it("returns auth error response when requireWorkspace rejects", async () => {
    requireWorkspaceMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401 })
    );

    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 404 when no draft exists", async () => {
    mockSupabase._setResult("issue_drafts", { data: null, error: null });

    const res = await GET();
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toContain("No draft found");
  });

  it("returns latest draft when exists", async () => {
    mockSupabase._setResult("issue_drafts", {
      data: {
        id: "d-1",
        content: "Draft content here",
        content_json: { title: "Test" },
        created_at: "2026-01-01",
      },
      error: null,
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.id).toBe("d-1");
    expect(json.draft).toBe("Draft content here");
    expect(json.content_json).toEqual({ title: "Test" });
  });

  it("returns 503 on query error", async () => {
    mockSupabase._setResult("issue_drafts", {
      data: null,
      error: { message: "table not found" },
    });

    const res = await GET();
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.detail).toBe("table not found");
  });
});
