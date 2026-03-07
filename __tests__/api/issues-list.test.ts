import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockSupabase, makeRequest } from "./helpers";

const mockSupabase = createMockSupabase();
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => mockSupabase,
}));

import { GET } from "@/app/api/issues/list/route";

beforeEach(() => {
  vi.stubEnv("WORKSPACE_ID", "ws-123");
  vi.clearAllMocks();
});

describe("GET /api/issues/list", () => {
  it("returns drafts", async () => {
    const drafts = [{ id: "d-1", content: "Draft content", content_json: { title: "Test" }, created_at: "2026-01-01" }];
    const chain = mockSupabase._setResult("issue_drafts", { data: drafts, error: null });

    const req = makeRequest("http://localhost:3000/api/issues/list?limit=5");
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.drafts).toEqual(drafts);
    expect(chain.limit).toHaveBeenCalledWith(5);
  });

  it("uses default limit of 10", async () => {
    const chain = mockSupabase._setResult("issue_drafts", { data: [], error: null });

    const req = makeRequest("http://localhost:3000/api/issues/list");
    await GET(req);

    expect(chain.limit).toHaveBeenCalledWith(10);
  });

  it("returns 500 on error", async () => {
    mockSupabase._setResult("issue_drafts", { data: null, error: { message: "fail" } });

    const req = makeRequest("http://localhost:3000/api/issues/list");
    const res = await GET(req);
    expect(res.status).toBe(500);
  });
});
