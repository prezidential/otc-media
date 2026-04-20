import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockSupabase } from "./helpers";

const mockSupabase = createMockSupabase();
const ctx = { supabase: mockSupabase, workspaceId: "ws-123", userId: "user-1", role: "owner" };

const { requireWorkspaceMock } = vi.hoisted(() => ({
  requireWorkspaceMock: vi.fn(),
}));
vi.mock("@/lib/auth/session", () => ({
  requireWorkspace: requireWorkspaceMock,
}));

import { GET } from "@/app/api/dashboard/stats/route";

beforeEach(() => {
  vi.clearAllMocks();
  requireWorkspaceMock.mockImplementation(async () => ctx);
});

describe("GET /api/dashboard/stats", () => {
  it("returns 401 when unauthenticated", async () => {
    requireWorkspaceMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401 })
    );
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns a payload with pipeline counts", async () => {
    mockSupabase._setResult("signals", { data: [], error: null, count: 7 });
    mockSupabase._setResult("editorial_leads", { data: null, error: null, count: 3 });
    mockSupabase._setResult("issue_drafts", { data: null, error: null, count: 5 });
    mockSupabase._setResult("content_outlines", { data: null, error: null, count: 2 });
    mockSupabase._setResult("runs", { data: null, error: null });

    const res = await GET();
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.pipeline).toBeDefined();
    expect(json.greeting).toBeDefined();
    expect(json.sidebar).toBeDefined();
  });
});
