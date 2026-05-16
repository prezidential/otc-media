import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockSupabase, makeRequest } from "./helpers";

const mockSupabase = createMockSupabase();
const ctx = { supabase: mockSupabase, workspaceId: "ws-123", userId: "user-1", role: "owner" as const };
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => mockSupabase,
  supabaseUser: async () => mockSupabase,
}));
vi.mock("@/lib/auth/session", () => ({
  requireWorkspace: vi.fn(async () => ctx),
}));

import { GET } from "@/app/api/leads/list/route";

beforeEach(() => {
  vi.stubEnv("WORKSPACE_ID", "ws-123");
  vi.clearAllMocks();
});

describe("GET /api/leads/list", () => {
  it("returns leads", async () => {
    const leads = [{ id: "1", angle: "Test", status: "pending_review" }];
    const chain = mockSupabase._setResult("editorial_leads", { data: leads, error: null });

    const req = makeRequest("http://localhost:3000/api/leads/list");
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.leads).toEqual(leads);
    expect(chain.eq).toHaveBeenCalledWith("workspace_id", "ws-123");
  });

  it("respects limit parameter", async () => {
    const chain = mockSupabase._setResult("editorial_leads", { data: [], error: null });

    const req = makeRequest("http://localhost:3000/api/leads/list?limit=5");
    await GET(req);

    expect(chain.limit).toHaveBeenCalledWith(5);
  });

  it("filters by status when provided", async () => {
    const chain = mockSupabase._setResult("editorial_leads", { data: [], error: null });

    const req = makeRequest("http://localhost:3000/api/leads/list?status=approved");
    await GET(req);

    expect(chain.eq).toHaveBeenCalledWith("status", "approved");
  });

  it("returns 500 on error", async () => {
    mockSupabase._setResult("editorial_leads", { data: null, error: { message: "fail" } });

    const req = makeRequest("http://localhost:3000/api/leads/list");
    const res = await GET(req);
    expect(res.status).toBe(500);
  });
});
