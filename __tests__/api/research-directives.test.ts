import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockSupabase, makeRequest, makeJsonRequest } from "./helpers";

const mockSupabase = createMockSupabase();
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => mockSupabase,
}));

import { GET } from "@/app/api/research/list-directives/route";
import { POST as SeedPOST } from "@/app/api/research/seed-directives/route";

beforeEach(() => {
  vi.stubEnv("WORKSPACE_ID", "ws-123");
  vi.clearAllMocks();
});

describe("GET /api/research/list-directives", () => {
  it("returns directives", async () => {
    const directives = [
      { id: "d-1", name: "Identity + AI", cadence: "daily", active: true },
    ];
    mockSupabase._setResult("research_directives", { data: directives, error: null });

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.directives).toEqual(directives);
  });

  it("returns 500 on error", async () => {
    mockSupabase._setResult("research_directives", {
      data: null,
      error: { message: "fail" },
    });

    const res = await GET();
    expect(res.status).toBe(500);
  });
});

describe("POST /api/research/seed-directives", () => {
  it("returns inserted: 0 when directives already exist", async () => {
    const chain = mockSupabase._setResult("research_directives", {
      data: [{ id: "existing" }],
      error: null,
    });
    chain.limit = vi.fn().mockResolvedValue({ data: [{ id: "existing" }], error: null });

    const res = await SeedPOST();
    const json = await res.json();

    expect(json.inserted).toBe(0);
  });

  it("returns 500 on fetch error", async () => {
    const chain = mockSupabase._setResult("research_directives", {
      data: null,
      error: null,
    });
    chain.limit = vi.fn().mockResolvedValue({ data: null, error: { message: "fetch fail" } });

    const res = await SeedPOST();
    expect(res.status).toBe(500);
  });
});
