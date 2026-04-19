import { describe, it, expect, vi, beforeEach } from "vitest";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/dashboard/stats", () => {
  it("returns 500 when WORKSPACE_ID is not set", async () => {
    vi.stubEnv("WORKSPACE_ID", "");
    const { GET } = await import("@/app/api/dashboard/stats/route");
    const res = await GET();
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toContain("WORKSPACE_ID");
  });
});
