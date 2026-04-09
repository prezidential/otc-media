import { describe, it, expect, beforeEach, vi } from "vitest";
import { GET } from "@/app/api/health/route";

describe("GET /api/health", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns 200 when core env vars are set", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co");
    vi.stubEnv("SUPABASE_SECRET_KEY", "secret");
    vi.stubEnv("WORKSPACE_ID", "00000000-0000-0000-0000-000000000001");

    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.checks.supabase_url).toBe(true);
    expect(json.checks.supabase_secret).toBe(true);
    expect(json.checks.workspace_id).toBe(true);
  });

  it("returns 503 when WORKSPACE_ID is missing", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co");
    vi.stubEnv("SUPABASE_SECRET_KEY", "secret");
    vi.stubEnv("WORKSPACE_ID", "");

    const res = await GET();
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.ok).toBe(false);
  });
});
