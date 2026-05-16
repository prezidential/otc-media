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

import { GET } from "@/app/api/brainstorm/sessions/[id]/route";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("WORKSPACE_ID", "ws-123");
  requireWorkspaceMock.mockImplementation(async () => ctx);
});

describe("GET /api/brainstorm/sessions/[id]", () => {
  it("returns auth error response when requireWorkspace rejects", async () => {
    requireWorkspaceMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401 })
    );
    const res = await GET(new Request("http://localhost/api/brainstorm/sessions/x"), {
      params: Promise.resolve({ id: "x" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 404 when session is not found", async () => {
    mockSupabase._setResult("brainstorm_sessions", { data: null, error: null });
    const res = await GET(new Request("http://localhost/api/brainstorm/sessions/x"), {
      params: Promise.resolve({ id: "x" }),
    });
    expect(res.status).toBe(404);
  });
});
