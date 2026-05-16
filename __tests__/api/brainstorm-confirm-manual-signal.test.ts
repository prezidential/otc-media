import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockSupabase } = vi.hoisted(() => {
  type Result = { data: unknown; error: { message: string } | null };

  function createChain(finalResult: Result = { data: null, error: null }) {
    const chain = {} as Record<string, ReturnType<typeof vi.fn>>;
    const methods = ["select", "insert", "update", "eq", "order", "limit"] as const;
    for (const method of methods) {
      chain[method] = vi.fn().mockReturnValue(chain);
    }
    chain.maybeSingle = vi.fn().mockResolvedValue(finalResult);
    chain.single = vi.fn().mockResolvedValue(finalResult);
    (chain as unknown as { then: (resolve: (value: Result) => void) => void }).then = (resolve) =>
      resolve(finalResult);
    return chain;
  }

  const chains = new Map<string, ReturnType<typeof createChain>>();
  const from = vi.fn((table: string) => {
    if (!chains.has(table)) {
      chains.set(table, createChain());
    }
    return chains.get(table)!;
  });

  return {
    mockSupabase: {
      from,
      _chains: chains,
      _reset() {
        chains.clear();
      },
      _setResult(table: string, result: Result) {
        const chain = createChain(result);
        chains.set(table, chain);
        return chain;
      },
    },
  };
});

vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => mockSupabase,
  supabaseUser: async () => mockSupabase,
}));

const ctxValue = { supabase: mockSupabase, workspaceId: "ws-123", userId: "user-1", role: "owner" as const };
vi.mock("@/lib/auth/session", () => ({
  requireWorkspace: vi.fn(async () => ctxValue),
}));

import { POST } from "@/app/api/brainstorm/sessions/[id]/confirm-manual-signal/route";

const ctx = { params: Promise.resolve({ id: "session-1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  mockSupabase._reset();
  vi.stubEnv("WORKSPACE_ID", "ws-123");
});

describe("POST /api/brainstorm/sessions/[id]/confirm-manual-signal", () => {
  it("returns 400 when the session has no pending manual signal", async () => {
    mockSupabase._setResult("brainstorm_sessions", {
      data: { id: "session-1", artifact_json: { working_artifact: { thesis: "Keep me" } } },
      error: null,
    });

    const res = await POST(
      new Request("http://localhost/api/brainstorm/sessions/session-1/confirm-manual-signal"),
      ctx
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toContain("No pending manual signal");
    expect(mockSupabase.from).toHaveBeenCalledTimes(1);
    expect(mockSupabase._chains.has("signals")).toBe(false);
  });

  it("requires a non-empty pending signal title before inserting", async () => {
    mockSupabase._setResult("brainstorm_sessions", {
      data: { id: "session-1", artifact_json: { pending_manual_signal: { title: "   " } } },
      error: null,
    });

    const res = await POST(
      new Request("http://localhost/api/brainstorm/sessions/session-1/confirm-manual-signal"),
      ctx
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toContain("missing a title");
    expect(mockSupabase._chains.has("signals")).toBe(false);
  });

  it("inserts the pending signal and clears only the pending artifact", async () => {
    const sessionChain = mockSupabase._setResult("brainstorm_sessions", {
      data: {
        id: "session-1",
        artifact_json: {
          working_artifact: { thesis: "Keep this draft state" },
          pending_manual_signal: {
            title: "  OAuth grants expanding in CI  ",
            url: "   ",
            notes: "  Field notes from customer calls  ",
          },
        },
      },
      error: null,
    });
    const signalChain = mockSupabase._setResult("signals", {
      data: { id: "signal-1", title: "OAuth grants expanding in CI", url: "manual://abc123" },
      error: null,
    });

    const res = await POST(
      new Request("http://localhost/api/brainstorm/sessions/session-1/confirm-manual-signal"),
      ctx
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({
      ok: true,
      signal: { id: "signal-1", title: "OAuth grants expanding in CI", url: "manual://abc123" },
    });

    expect(signalChain.insert).toHaveBeenCalledTimes(1);
    const insertPayload = vi.mocked(signalChain.insert).mock.calls[0][0] as Record<string, unknown>;
    expect(insertPayload).toMatchObject({
      workspace_id: "ws-123",
      source_id: null,
      title: "OAuth grants expanding in CI",
      publisher: "Manual Entry",
      raw_text: "Field notes from customer calls",
      normalized_summary: "Field notes from customer calls",
      relevance_score: 0.5,
      trust_score: 1.0,
    });
    expect(insertPayload.url).toMatch(/^manual:\/\/[a-f0-9]{12}$/);
    expect(insertPayload.dedupe_hash).toMatch(/^[a-f0-9]{64}$/);

    expect(sessionChain.update).toHaveBeenCalledTimes(1);
    const updatePayload = vi.mocked(sessionChain.update).mock.calls[0][0] as Record<string, unknown>;
    expect(updatePayload.artifact_json).toEqual({
      working_artifact: { thesis: "Keep this draft state" },
      pending_manual_signal: null,
    });
  });
});
