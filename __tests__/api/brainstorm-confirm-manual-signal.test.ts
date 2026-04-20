import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabase, makeRequest } from "./helpers";

const mockSupabase = createMockSupabase();

vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => mockSupabase,
}));

import { POST } from "@/app/api/brainstorm/sessions/[id]/confirm-manual-signal/route";

describe("POST /api/brainstorm/sessions/[id]/confirm-manual-signal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase._chains.clear();
    vi.stubEnv("WORKSPACE_ID", "ws-123");
  });

  it("returns 500 when WORKSPACE_ID is not configured", async () => {
    vi.stubEnv("WORKSPACE_ID", "");

    const res = await POST(makeRequest("http://localhost:3000/api/brainstorm/sessions/s-1"), {
      params: Promise.resolve({ id: "s-1" }),
    });
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toContain("WORKSPACE_ID");
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  it("returns 400 when session has no pending manual signal", async () => {
    mockSupabase._setResult("brainstorm_sessions", {
      data: { id: "s-1", artifact_json: { some: "field" } },
      error: null,
    });

    const res = await POST(makeRequest("http://localhost:3000/api/brainstorm/sessions/s-1"), {
      params: Promise.resolve({ id: "s-1" }),
    });
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toContain("No pending manual signal");
    expect(mockSupabase.from).not.toHaveBeenCalledWith("signals");
  });

  it("returns 400 when pending manual signal title is blank", async () => {
    mockSupabase._setResult("brainstorm_sessions", {
      data: {
        id: "s-1",
        artifact_json: {
          pending_manual_signal: {
            title: "   ",
            url: "https://example.com/source",
            notes: "notes",
          },
        },
      },
      error: null,
    });

    const res = await POST(makeRequest("http://localhost:3000/api/brainstorm/sessions/s-1"), {
      params: Promise.resolve({ id: "s-1" }),
    });
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toContain("missing a title");
    expect(mockSupabase.from).not.toHaveBeenCalledWith("signals");
  });

  it("creates a signal with provided URL and clears pending_manual_signal", async () => {
    mockSupabase._setResult("brainstorm_sessions", {
      data: {
        id: "s-1",
        artifact_json: {
          keep_me: { x: 1 },
          pending_manual_signal: {
            title: "  Zero-day roundup  ",
            url: "  https://example.com/security  ",
            notes: "  Manual analyst notes  ",
          },
        },
      },
      error: null,
    });
    mockSupabase._setResult("signals", {
      data: { id: "sig-1", title: "Zero-day roundup", url: "https://example.com/security" },
      error: null,
    });

    const res = await POST(makeRequest("http://localhost:3000/api/brainstorm/sessions/s-1"), {
      params: Promise.resolve({ id: "s-1" }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.signal).toEqual({
      id: "sig-1",
      title: "Zero-day roundup",
      url: "https://example.com/security",
    });

    const signalsChain = mockSupabase._chains.get("signals");
    expect(signalsChain?.insert).toHaveBeenCalledTimes(1);
    const insertedSignal = signalsChain?.insert.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(insertedSignal.workspace_id).toBe("ws-123");
    expect(insertedSignal.title).toBe("Zero-day roundup");
    expect(insertedSignal.publisher).toBe("Manual Entry");
    expect(insertedSignal.url).toBe("https://example.com/security");
    expect(insertedSignal.raw_text).toBe("Manual analyst notes");
    expect(insertedSignal.normalized_summary).toBe("Manual analyst notes");
    expect(insertedSignal.relevance_score).toBe(0.5);
    expect(insertedSignal.trust_score).toBe(1);
    expect(insertedSignal.dedupe_hash).toMatch(/^[a-f0-9]{64}$/);

    const sessionsChain = mockSupabase._chains.get("brainstorm_sessions");
    expect(sessionsChain?.update).toHaveBeenCalledTimes(1);
    const updatePayload = sessionsChain?.update.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(updatePayload.artifact_json).toEqual({
      keep_me: { x: 1 },
      pending_manual_signal: null,
    });
    expect(typeof updatePayload.updated_at).toBe("string");
  });

  it("falls back to deterministic manual URL and null notes when optional fields are missing", async () => {
    mockSupabase._setResult("brainstorm_sessions", {
      data: {
        id: "s-1",
        artifact_json: {
          pending_manual_signal: {
            title: "Manual signal title",
            url: "",
            notes: "   ",
          },
        },
      },
      error: null,
    });
    mockSupabase._setResult("signals", {
      data: { id: "sig-2", title: "Manual signal title", url: "manual://abcdef123456" },
      error: null,
    });

    const res = await POST(makeRequest("http://localhost:3000/api/brainstorm/sessions/s-1"), {
      params: Promise.resolve({ id: "s-1" }),
    });

    expect(res.status).toBe(200);

    const signalsChain = mockSupabase._chains.get("signals");
    const insertedSignal = signalsChain?.insert.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(insertedSignal.url).toMatch(/^manual:\/\/[a-f0-9]{12}$/);
    expect(insertedSignal.raw_text).toBeNull();
    expect(insertedSignal.normalized_summary).toBeNull();
  });
});
