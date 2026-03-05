import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockSupabase, makeRequest } from "./helpers";

const mockSupabase = createMockSupabase();
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => mockSupabase,
}));

import { GET } from "@/app/api/signals/list/route";

beforeEach(() => {
  vi.stubEnv("WORKSPACE_ID", "ws-123");
  vi.clearAllMocks();
});

describe("GET /api/signals/list", () => {
  it("returns signals from supabase", async () => {
    const signals = [
      { title: "Signal 1", publisher: "Pub", url: "https://a.com", published_at: null, captured_at: "2026-01-01" },
    ];
    const chain = mockSupabase._setResult("signals", { data: signals, error: null });

    const req = makeRequest("http://localhost:3000/api/signals/list?limit=10");
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.signals).toEqual(signals);
    expect(chain.eq).toHaveBeenCalledWith("workspace_id", "ws-123");
    expect(chain.limit).toHaveBeenCalledWith(10);
  });

  it("uses default limit of 25", async () => {
    const chain = mockSupabase._setResult("signals", { data: [], error: null });

    const req = makeRequest("http://localhost:3000/api/signals/list");
    await GET(req);

    expect(chain.limit).toHaveBeenCalledWith(25);
  });

  it("returns 500 on supabase error", async () => {
    mockSupabase._setResult("signals", { data: null, error: { message: "DB error" } });

    const req = makeRequest("http://localhost:3000/api/signals/list");
    const res = await GET(req);

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("DB error");
  });

  it("returns empty array when no data", async () => {
    mockSupabase._setResult("signals", { data: null, error: null });

    const req = makeRequest("http://localhost:3000/api/signals/list");
    const res = await GET(req);
    const json = await res.json();

    expect(json.signals).toEqual([]);
  });
});
