import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabase } from "./helpers";

const mockSupabase = createMockSupabase();

vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => mockSupabase,
}));

import { POST } from "@/app/api/brainstorm/sessions/[id]/confirm-manual-signal/route";

function routeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.stubEnv("WORKSPACE_ID", "ws-123");
  vi.clearAllMocks();
});

describe("POST /api/brainstorm/sessions/[id]/confirm-manual-signal", () => {
  it("rejects sessions without a pending manual signal", async () => {
    mockSupabase._setResult("brainstorm_sessions", {
      data: { id: "session-1", artifact_json: { working_artifact: { thesis: "x" } } },
      error: null,
    });

    const res = await POST(new Request("http://localhost/api/brainstorm/sessions/session-1/confirm-manual-signal"), routeParams("session-1"));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("No pending manual signal on this session");
    expect(mockSupabase.from).not.toHaveBeenCalledWith("signals");
  });

  it("rejects pending manual signals without a title", async () => {
    mockSupabase._setResult("brainstorm_sessions", {
      data: { id: "session-1", artifact_json: { pending_manual_signal: { title: "   " } } },
      error: null,
    });

    const res = await POST(new Request("http://localhost/api/brainstorm/sessions/session-1/confirm-manual-signal"), routeParams("session-1"));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("Pending signal is missing a title");
    expect(mockSupabase.from).not.toHaveBeenCalledWith("signals");
  });

  it("creates a signal with a deterministic manual URL and clears the pending artifact", async () => {
    const sessionChain = mockSupabase._setResult("brainstorm_sessions", {
      data: {
        id: "session-1",
        artifact_json: {
          pending_manual_signal: {
            title: "  Manual topic  ",
            notes: "  Useful context  ",
          },
          working_artifact: { thesis: "keep me" },
        },
      },
      error: null,
    });
    const signalChain = mockSupabase._setResult("signals", {
      data: {
        id: "signal-1",
        title: "Manual topic",
        url: "manual://returned",
      },
      error: null,
    });

    const res = await POST(new Request("http://localhost/api/brainstorm/sessions/session-1/confirm-manual-signal"), routeParams("session-1"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({
      ok: true,
      signal: {
        id: "signal-1",
        title: "Manual topic",
        url: "manual://returned",
      },
    });
    expect(signalChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        workspace_id: "ws-123",
        url: expect.stringMatching(/^manual:\/\/[a-f0-9]{12}$/),
        title: "Manual topic",
        publisher: "Manual Entry",
        raw_text: "Useful context",
        normalized_summary: "Useful context",
      })
    );
    expect(sessionChain.update).toHaveBeenCalledWith({
      artifact_json: {
        pending_manual_signal: null,
        working_artifact: { thesis: "keep me" },
      },
      updated_at: expect.any(String),
    });
  });
});
