import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockSupabase, makeRequest } from "./helpers";

const mockSupabase = createMockSupabase();
const ctx = { supabase: mockSupabase, workspaceId: "ws-123", userId: "user-1", role: "owner" as const };

vi.mock("@/lib/auth/session", () => ({
  requireWorkspace: vi.fn(async () => ctx),
}));

import { GET, PUT } from "@/app/api/research-intent/route";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/research-intent", () => {
  it("returns stored intent for the active workspace", async () => {
    const intent = {
      id: "ri-1",
      topic_focus: ["identity security"],
      watch_entities: ["Okta"],
      keywords: ["ITDR"],
      updated_at: "2026-08-01T00:00:00Z",
    };
    const chain = mockSupabase._setResult("research_intent", { data: intent, error: null });

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.intent).toEqual(intent);
    expect(chain.eq).toHaveBeenCalledWith("workspace_id", "ws-123");
  });

  it("returns empty arrays when no row exists", async () => {
    mockSupabase._setResult("research_intent", { data: null, error: null });

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.intent).toEqual({ topic_focus: [], watch_entities: [], keywords: [] });
  });

  it("returns 500 on supabase error", async () => {
    mockSupabase._setResult("research_intent", { data: null, error: { message: "DB error" } });

    const res = await GET();
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("DB error");
  });
});

describe("PUT /api/research-intent", () => {
  it("upserts string arrays and ignores non-strings", async () => {
    const saved = {
      id: "ri-1",
      topic_focus: ["IAM"],
      watch_entities: [],
      keywords: ["zero trust"],
      updated_at: "2026-08-31T00:00:00Z",
    };
    const chain = mockSupabase._setResult("research_intent", { data: saved, error: null });

    const req = makeRequest("http://localhost:3000/api/research-intent", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topic_focus: ["IAM", 12],
        watch_entities: "not-an-array",
        keywords: ["zero trust"],
      }),
    });

    const res = await PUT(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.intent).toEqual(saved);
    expect(chain.upsert).toHaveBeenCalled();
    const payload = chain.upsert.mock.calls[0][0];
    expect(payload.workspace_id).toBe("ws-123");
    expect(payload.topic_focus).toEqual(["IAM"]);
    expect(payload.watch_entities).toEqual([]);
    expect(payload.keywords).toEqual(["zero trust"]);
  });

  it("returns 500 on upsert error", async () => {
    mockSupabase._setResult("research_intent", { data: null, error: { message: "upsert fail" } });

    const res = await PUT(makeRequest("http://localhost:3000/api/research-intent", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic_focus: ["IAM"] }),
    }));
    expect(res.status).toBe(500);
  });
});
