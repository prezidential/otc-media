import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabase } from "./helpers";

const mockSupabase = createMockSupabase();

vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => mockSupabase,
}));

import { POST } from "@/app/api/brainstorm/sessions/[id]/confirm-manual-signal/route";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("WORKSPACE_ID", "ws-123");
  mockSupabase._setResult("signals", {
    data: { id: "sig-1", title: "Manual signal", url: "manual://fallback" },
    error: null,
  });
});

describe("POST /api/brainstorm/sessions/[id]/confirm-manual-signal", () => {
  it("creates a manual signal from the pending artifact and clears it from the session", async () => {
    const sessionChain = mockSupabase._setResult("brainstorm_sessions", {
      data: {
        id: "session-1",
        artifact_json: {
          pending_manual_signal: {
            title: "  Manual signal  ",
            notes: "  Important context  ",
          },
          working_artifact: { thesis: "keep this" },
        },
      },
      error: null,
    });

    const res = await POST(new Request("http://localhost/api/brainstorm/sessions/session-1/confirm-manual-signal"), {
      params: Promise.resolve({ id: "session-1" }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({
      ok: true,
      signal: { id: "sig-1", title: "Manual signal", url: "manual://fallback" },
    });

    const signalChain = mockSupabase._chains.get("signals")!;
    expect(signalChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        workspace_id: "ws-123",
        source_id: null,
        title: "Manual signal",
        publisher: "Manual Entry",
        raw_text: "Important context",
        normalized_summary: "Important context",
        relevance_score: 0.5,
        trust_score: 1.0,
        dedupe_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
        url: expect.stringMatching(/^manual:\/\/[a-f0-9]{12}$/),
      })
    );

    expect(sessionChain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        artifact_json: {
          pending_manual_signal: null,
          working_artifact: { thesis: "keep this" },
        },
        updated_at: expect.any(String),
      })
    );
  });

  it("rejects a pending manual signal without a usable title", async () => {
    mockSupabase._setResult("brainstorm_sessions", {
      data: {
        id: "session-1",
        artifact_json: {
          pending_manual_signal: { title: "   ", notes: "context" },
        },
      },
      error: null,
    });

    const res = await POST(new Request("http://localhost/api/brainstorm/sessions/session-1/confirm-manual-signal"), {
      params: Promise.resolve({ id: "session-1" }),
    });
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toContain("missing a title");
    expect(mockSupabase._chains.get("signals")!.insert).not.toHaveBeenCalled();
  });
});
