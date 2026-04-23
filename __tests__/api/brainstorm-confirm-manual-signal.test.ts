import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabase, makeRequest } from "./helpers";

const mockSupabase = createMockSupabase();

vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => mockSupabase,
}));

import { POST } from "@/app/api/brainstorm/sessions/[id]/confirm-manual-signal/route";

function routeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("WORKSPACE_ID", "ws-123");
});

describe("POST /api/brainstorm/sessions/[id]/confirm-manual-signal", () => {
  it("returns 500 when WORKSPACE_ID is missing", async () => {
    vi.stubEnv("WORKSPACE_ID", "");

    const res = await POST(
      makeRequest("http://localhost:3000/api/brainstorm/sessions/sess-1/confirm-manual-signal", {
        method: "POST",
      }),
      routeParams("sess-1")
    );
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toContain("WORKSPACE_ID");
  });

  it("returns 400 when there is no pending manual signal artifact", async () => {
    const sessionChain = mockSupabase._setResult("brainstorm_sessions", { data: null, error: null });
    sessionChain.maybeSingle.mockResolvedValueOnce({
      data: {
        id: "sess-1",
        artifact_json: {},
      },
      error: null,
    });

    const res = await POST(
      makeRequest("http://localhost:3000/api/brainstorm/sessions/sess-1/confirm-manual-signal", {
        method: "POST",
      }),
      routeParams("sess-1")
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toContain("No pending manual signal");
    expect(mockSupabase.from).not.toHaveBeenCalledWith("signals");
  });

  it("returns 400 when pending signal has no title", async () => {
    const sessionChain = mockSupabase._setResult("brainstorm_sessions", { data: null, error: null });
    sessionChain.maybeSingle.mockResolvedValueOnce({
      data: {
        id: "sess-1",
        artifact_json: { pending_manual_signal: { url: "https://example.com" } },
      },
      error: null,
    });

    const res = await POST(
      makeRequest("http://localhost:3000/api/brainstorm/sessions/sess-1/confirm-manual-signal", {
        method: "POST",
      }),
      routeParams("sess-1")
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toContain("missing a title");
    expect(mockSupabase.from).not.toHaveBeenCalledWith("signals");
  });

  it("creates a signal, clears pending artifact, and returns created signal", async () => {
    const sessionChain = mockSupabase._setResult("brainstorm_sessions", { data: null, error: null });
    sessionChain.maybeSingle.mockResolvedValueOnce({
      data: {
        id: "sess-1",
        artifact_json: {
          pending_manual_signal: {
            title: "  AI launch rumor  ",
            url: " https://news.example/ai-rumor ",
            notes: "  Mentioned by two creators.  ",
          },
          existing_key: "keep-me",
        },
      },
      error: null,
    });

    const signalsChain = mockSupabase._setResult("signals", {
      data: { id: "sig-1", title: "AI launch rumor", url: "https://news.example/ai-rumor" },
      error: null,
    });
    signalsChain.single.mockResolvedValueOnce({
      data: { id: "sig-1", title: "AI launch rumor", url: "https://news.example/ai-rumor" },
      error: null,
    });

    const res = await POST(
      makeRequest("http://localhost:3000/api/brainstorm/sessions/sess-1/confirm-manual-signal", {
        method: "POST",
      }),
      routeParams("sess-1")
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({
      ok: true,
      signal: { id: "sig-1", title: "AI launch rumor", url: "https://news.example/ai-rumor" },
    });

    expect(signalsChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        workspace_id: "ws-123",
        title: "AI launch rumor",
        publisher: "Manual Entry",
        raw_text: "Mentioned by two creators.",
        normalized_summary: "Mentioned by two creators.",
      })
    );

    expect(signalsChain.insert.mock.calls[0]?.[0]?.url).toBe("https://news.example/ai-rumor");
    expect(String(signalsChain.insert.mock.calls[0]?.[0]?.dedupe_hash)).toMatch(/^[a-f0-9]{64}$/);

    expect(sessionChain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        artifact_json: { pending_manual_signal: null, existing_key: "keep-me" },
      })
    );
  });
});
