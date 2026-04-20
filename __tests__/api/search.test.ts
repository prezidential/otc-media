import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockSupabase } from "./helpers";

const mockSupabase = createMockSupabase();
const ctx = { supabase: mockSupabase, workspaceId: "ws-1", userId: "user-1", role: "owner" };
const { requireWorkspaceMock } = vi.hoisted(() => ({
  requireWorkspaceMock: vi.fn(),
}));
vi.mock("@/lib/auth/session", () => ({
  requireWorkspace: requireWorkspaceMock,
}));

import { GET } from "@/app/api/search/route";

beforeEach(() => {
  vi.clearAllMocks();
  requireWorkspaceMock.mockImplementation(async () => ctx);
});

describe("GET /api/search", () => {
  it("returns 401 when unauthenticated", async () => {
    requireWorkspaceMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401 })
    );
    const res = await GET(new Request("http://localhost/api/search?q=test"));
    expect(res.status).toBe(401);
  });

  it("returns empty buckets when q is blank (without invoking auth)", async () => {
    const res = await GET(new Request("http://localhost/api/search?q=   "));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.signals).toEqual([]);
    expect(json.leads).toEqual([]);
    expect(json.drafts).toEqual([]);
    expect(json.outlines).toEqual([]);
    expect(requireWorkspaceMock).not.toHaveBeenCalled();
  });

  it("queries supabase with the active workspaceId on a non-empty query", async () => {
    const sigChain = mockSupabase._setResult("signals", { data: [], error: null });
    mockSupabase._setResult("editorial_leads", { data: [], error: null });
    mockSupabase._setResult("issue_drafts", { data: [], error: null });
    mockSupabase._setResult("content_outlines", { data: [], error: null });

    const res = await GET(new Request("http://localhost/api/search?q=test"));
    expect(res.status).toBe(200);
    expect(sigChain.eq).toHaveBeenCalledWith("workspace_id", "ws-1");
  });
});
