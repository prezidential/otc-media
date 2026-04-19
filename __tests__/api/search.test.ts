import { describe, it, expect, vi, beforeEach } from "vitest";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/search", () => {
  it("returns 500 when WORKSPACE_ID is not set", async () => {
    vi.stubEnv("WORKSPACE_ID", "");
    const { GET } = await import("@/app/api/search/route");
    const res = await GET(new Request("http://localhost/api/search?q=test"));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toContain("WORKSPACE_ID");
  });

  it("returns empty buckets when q is blank", async () => {
    vi.stubEnv("WORKSPACE_ID", "ws-1");
    const { GET } = await import("@/app/api/search/route");
    const res = await GET(new Request("http://localhost/api/search?q=   "));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.signals).toEqual([]);
    expect(json.leads).toEqual([]);
    expect(json.drafts).toEqual([]);
    expect(json.outlines).toEqual([]);
  });
});
