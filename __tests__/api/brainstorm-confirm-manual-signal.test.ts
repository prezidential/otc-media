import crypto from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabase, makeRequest } from "./helpers";

const mockSupabase = createMockSupabase();

vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => mockSupabase,
}));

import { POST } from "@/app/api/brainstorm/sessions/[id]/confirm-manual-signal/route";

function params(id = "session-1") {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("WORKSPACE_ID", "ws-123");
});

describe("POST /api/brainstorm/sessions/[id]/confirm-manual-signal", () => {
  it("returns 400 when no pending manual signal exists on the artifact", async () => {
    mockSupabase._setResult("brainstorm_sessions", {
      data: { id: "session-1", artifact_json: { working_artifact: { thesis: "x" } } },
      error: null,
    });

    const res = await POST(makeRequest("http://localhost/api/brainstorm/sessions/session-1/confirm-manual-signal"), params());
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("No pending manual signal on this session");
    expect(mockSupabase.from.mock.calls.some(([table]) => table === "signals")).toBe(false);
  });

  it("returns 400 when pending signal has no title", async () => {
    mockSupabase._setResult("brainstorm_sessions", {
      data: {
        id: "session-1",
        artifact_json: { pending_manual_signal: { url: "https://example.com/signal", notes: "important" } },
      },
      error: null,
    });

    const res = await POST(makeRequest("http://localhost/api/brainstorm/sessions/session-1/confirm-manual-signal"), params());
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("Pending signal is missing a title");
    expect(mockSupabase.from.mock.calls.some(([table]) => table === "signals")).toBe(false);
  });

  it("creates a manual signal and clears pending artifact state", async () => {
    const title = "Massive auth outage postmortem";
    const notes = "Customer-facing timeline and remediation plan.";
    mockSupabase._setResult("brainstorm_sessions", {
      data: {
        id: "session-1",
        artifact_json: {
          working_artifact: { thesis: "Resilience under incident stress" },
          pending_manual_signal: { title, notes },
        },
      },
      error: null,
    });
    mockSupabase._setResult("signals", {
      data: { id: "sig-1", title, url: "manual://ignored-in-mock" },
      error: null,
    });

    const res = await POST(makeRequest("http://localhost/api/brainstorm/sessions/session-1/confirm-manual-signal"), params());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.signal).toEqual({ id: "sig-1", title, url: "manual://ignored-in-mock" });

    const signalChain = mockSupabase._chains.get("signals");
    expect(signalChain).toBeTruthy();

    const insertedSignal = signalChain!.insert.mock.calls[0]?.[0] as Record<string, unknown>;
    const dedupeHash = crypto
      .createHash("sha256")
      .update(`manual|${title}|Manual Entry`)
      .digest("hex");

    expect(insertedSignal).toEqual(
      expect.objectContaining({
        workspace_id: "ws-123",
        source_id: null,
        title,
        publisher: "Manual Entry",
        raw_text: notes,
        normalized_summary: notes,
        dedupe_hash: dedupeHash,
      })
    );
    expect(insertedSignal.url).toMatch(/^manual:\/\/[a-f0-9]{12}$/);

    const sessionsChain = mockSupabase._chains.get("brainstorm_sessions");
    expect(sessionsChain).toBeTruthy();
    expect(sessionsChain!.update).toHaveBeenCalledWith(
      expect.objectContaining({
        artifact_json: {
          working_artifact: { thesis: "Resilience under incident stress" },
          pending_manual_signal: null,
        },
      })
    );
  });
});
