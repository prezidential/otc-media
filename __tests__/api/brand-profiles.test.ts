import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockSupabase, makeRequest, makeJsonRequest } from "./helpers";

const mockSupabase = createMockSupabase();
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => mockSupabase,
}));

import { GET } from "@/app/api/brand-profiles/list/route";
import { POST } from "@/app/api/brand-profiles/seed/route";

beforeEach(() => {
  vi.stubEnv("WORKSPACE_ID", "ws-123");
  vi.clearAllMocks();
});

describe("GET /api/brand-profiles/list", () => {
  it("returns brand profiles", async () => {
    const profiles = [{ id: "bp-1", name: "Identity Jedi Newsletter" }];
    mockSupabase._setResult("brand_profiles", { data: profiles, error: null });

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.brandProfiles).toEqual(profiles);
  });

  it("returns 500 on error", async () => {
    mockSupabase._setResult("brand_profiles", { data: null, error: { message: "fail" } });

    const res = await GET();
    expect(res.status).toBe(500);
  });
});

describe("POST /api/brand-profiles/seed", () => {
  it("returns inserted: 0 when profiles already exist", async () => {
    const chain = mockSupabase._setResult("brand_profiles", {
      data: [{ id: "existing" }],
      error: null,
    });
    // Override the limit to return existing data
    chain.limit = vi.fn().mockResolvedValue({ data: [{ id: "existing" }], error: null });

    const res = await POST();
    const json = await res.json();

    expect(json.inserted).toBe(0);
  });

  it("returns 500 on fetch error", async () => {
    const chain = mockSupabase._setResult("brand_profiles", { data: null, error: null });
    chain.limit = vi.fn().mockResolvedValue({ data: null, error: { message: "fetch fail" } });

    const res = await POST();
    expect(res.status).toBe(500);
  });
});
