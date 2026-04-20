import { describe, it, expect, vi, beforeEach } from "vitest";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/brainstorm/sessions/[id]", () => {
  it("returns 500 when WORKSPACE_ID is not set", async () => {
    vi.stubEnv("WORKSPACE_ID", "");
    const { GET } = await import("@/app/api/brainstorm/sessions/[id]/route");
    const res = await GET(new Request("http://localhost/api/brainstorm/sessions/x"), {
      params: Promise.resolve({ id: "x" }),
    });
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toContain("WORKSPACE_ID");
  });
});
