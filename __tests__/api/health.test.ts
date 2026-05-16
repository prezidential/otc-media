import { describe, it, expect, beforeEach, vi } from "vitest";
import { createMockSupabase } from "./helpers";

const mockSupabase = createMockSupabase();
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => mockSupabase,
}));

import { GET } from "@/app/api/health/route";

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("GET /api/health", () => {
  it("returns 200 when env vars are set and Supabase is reachable", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co");
    vi.stubEnv("SUPABASE_SECRET_KEY", "secret");
    mockSupabase._setResult("workspaces", { data: [], error: null, count: 0 });

    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.supabase).toBe("ok");
    expect(json.checks.supabase_url).toBe(true);
    expect(json.checks.supabase_secret).toBe(true);
    expect(json.checks.supabase_reachable).toBe(true);
    expect(json.checks).not.toHaveProperty("workspace_id");
  });

  it("returns 503 when Supabase env vars are missing", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SECRET_KEY", "secret");

    const res = await GET();
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.supabase).toBe("skipped");
  });

  it("returns 503 when Supabase query errors", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co");
    vi.stubEnv("SUPABASE_SECRET_KEY", "secret");
    mockSupabase._setResult("workspaces", { data: null, error: { message: "boom" } });

    const res = await GET();
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.supabase).toBe("error");
    expect(json.supabase_error).toBe("boom");
  });
});
