import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockSupabase, makeRequest, makeJsonRequest } from "./helpers";

const mockSupabase = createMockSupabase();
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => mockSupabase,
}));

import { GET } from "@/app/api/revenue/list/route";
import { POST as SeedPOST } from "@/app/api/revenue/seed/route";

beforeEach(() => {
  vi.stubEnv("WORKSPACE_ID", "ws-123");
  vi.clearAllMocks();
});

describe("GET /api/revenue/list", () => {
  it("returns active revenue items", async () => {
    const items = [{ id: "r-1", type: "premium", title: "Premium" }];
    const chain = mockSupabase._setResult("revenue_items", { data: items, error: null });

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.items).toEqual(items);
    expect(chain.eq).toHaveBeenCalledWith("active", true);
  });

  it("returns 500 on error", async () => {
    mockSupabase._setResult("revenue_items", { data: null, error: { message: "fail" } });

    const res = await GET();
    expect(res.status).toBe(500);
  });
});

describe("POST /api/revenue/seed", () => {
  it("returns inserted: 0 when items already exist", async () => {
    const chain = mockSupabase._setResult("revenue_items", {
      data: [{ id: "existing" }],
      error: null,
    });
    chain.limit = vi.fn().mockResolvedValue({ data: [{ id: "existing" }], error: null });

    const res = await SeedPOST();
    const json = await res.json();

    expect(json.inserted).toBe(0);
  });
});
