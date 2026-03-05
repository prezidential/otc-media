import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockSupabase } from "./helpers";

const mockSupabase = createMockSupabase();
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => mockSupabase,
}));

import { GET } from "@/app/api/issues/latest/route";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/issues/latest", () => {
  it("returns 503 when WORKSPACE_ID is not set", async () => {
    vi.stubEnv("WORKSPACE_ID", "");

    const res = await GET();
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.error).toContain("WORKSPACE_ID");
  });

  it("returns 404 when no draft exists", async () => {
    vi.stubEnv("WORKSPACE_ID", "ws-123");
    const chain = mockSupabase._setResult("issue_drafts", { data: null, error: null });

    const res = await GET();
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toContain("No draft found");
  });

  it("returns latest draft when exists", async () => {
    vi.stubEnv("WORKSPACE_ID", "ws-123");
    mockSupabase._setResult("issue_drafts", {
      data: {
        id: "d-1",
        content: "Draft content here",
        content_json: { title: "Test" },
        created_at: "2026-01-01",
      },
      error: null,
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.id).toBe("d-1");
    expect(json.draft).toBe("Draft content here");
    expect(json.content_json).toEqual({ title: "Test" });
  });

  it("returns 503 on query error", async () => {
    vi.stubEnv("WORKSPACE_ID", "ws-123");
    mockSupabase._setResult("issue_drafts", {
      data: null,
      error: { message: "table not found" },
    });

    const res = await GET();
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.detail).toBe("table not found");
  });
});
