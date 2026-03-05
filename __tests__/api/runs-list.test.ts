import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockSupabase, makeRequest } from "./helpers";

const mockSupabase = createMockSupabase();
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => mockSupabase,
}));

import { GET } from "@/app/api/runs/list/route";

beforeEach(() => {
  vi.stubEnv("WORKSPACE_ID", "ws-123");
  vi.clearAllMocks();
});

describe("GET /api/runs/list", () => {
  it("returns runs", async () => {
    const runs = [{ run_type: "lead_generation", status: "completed" }];
    mockSupabase._setResult("runs", { data: runs, error: null });

    const req = makeRequest("http://localhost:3000/api/runs/list");
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.runs).toEqual(runs);
  });

  it("uses default limit of 25", async () => {
    const chain = mockSupabase._setResult("runs", { data: [], error: null });

    const req = makeRequest("http://localhost:3000/api/runs/list");
    await GET(req);

    expect(chain.limit).toHaveBeenCalledWith(25);
  });

  it("returns 500 on error", async () => {
    mockSupabase._setResult("runs", { data: null, error: { message: "fail" } });

    const req = makeRequest("http://localhost:3000/api/runs/list");
    const res = await GET(req);
    expect(res.status).toBe(500);
  });
});
