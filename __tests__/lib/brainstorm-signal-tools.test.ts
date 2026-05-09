import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabase } from "../api/helpers";

const mockRunCadenceIngest = vi.hoisted(() => vi.fn());

vi.mock("@/lib/research/runCadenceIngest", () => ({
  runCadenceIngest: (...args: unknown[]) => mockRunCadenceIngest(...args),
}));

import { brainstormQuerySignals, executeBrainstormTool } from "@/lib/brainstorm/signal-tools";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("brainstormQuerySignals", () => {
  it("clamps limit and applies sanitized query filters", async () => {
    const supabase = createMockSupabase();
    const chain = supabase._setResult("signals", {
      data: [{ id: "sig-1", title: "One" }],
      error: null,
    }) as unknown as {
      ilike?: ReturnType<typeof vi.fn>;
      eq: ReturnType<typeof vi.fn>;
      gte: ReturnType<typeof vi.fn>;
      limit: ReturnType<typeof vi.fn>;
    };
    chain.ilike = vi.fn().mockReturnValue(chain);

    const result = await brainstormQuerySignals(supabase as never, "ws-123", {
      q: "zero%,day",
      limit: 999,
      sinceDays: "7",
      directive_id: " dir-1 ",
    });

    expect(chain.limit).toHaveBeenCalledWith(50);
    expect(chain.eq).toHaveBeenCalledWith("workspace_id", "ws-123");
    expect(chain.eq).toHaveBeenCalledWith("directive_id", "dir-1");
    expect(chain.gte).toHaveBeenCalledWith("captured_at", expect.any(String));
    expect(chain.ilike).toHaveBeenCalledWith("title", "%zero\\% day%");
    expect(result).toEqual({
      signals: [{ id: "sig-1", title: "One" }],
      count: 1,
    });
  });
});

describe("executeBrainstormTool", () => {
  it("normalizes trigger_signal_ingest args and forwards run result", async () => {
    const supabase = createMockSupabase();
    mockRunCadenceIngest.mockResolvedValueOnce({
      ok: true,
      inserted: 4,
      skipped: 2,
      details: [{ directive: "Identity + AI", feedUrl: "https://feed", inserted: 4, skipped: 2 }],
      error: undefined,
      run_id: "run-1",
    });

    const result = await executeBrainstormTool(
      supabase as never,
      "ws-123",
      "trigger_signal_ingest",
      { cadence: "monthly", limit_per_feed: 1 },
      {}
    );

    expect(mockRunCadenceIngest).toHaveBeenCalledWith(
      supabase,
      "ws-123",
      "daily",
      5,
      { source: "brainstorm_tool_trigger_signal_ingest" }
    );
    expect(result).toMatchObject({
      ok: true,
      cadence: "daily",
      limit_per_feed: 5,
      inserted: 4,
      skipped: 2,
      run_id: "run-1",
    });
  });

  it("requires active session for propose_manual_signal", async () => {
    const supabase = createMockSupabase();
    await expect(
      executeBrainstormTool(
        supabase as never,
        "ws-123",
        "propose_manual_signal",
        { title: "A title" },
        {}
      )
    ).rejects.toThrow("requires an active brainstorm session");
  });

  it("merges pending manual signal into session artifact", async () => {
    const supabase = createMockSupabase();
    const chain = supabase._setResult("brainstorm_sessions", {
      data: { artifact_json: { existing: true } },
      error: null,
    });

    const result = await executeBrainstormTool(
      supabase as never,
      "ws-123",
      "propose_manual_signal",
      { title: "  New source  ", url: " https://example.com ", notes: " use this " },
      { sessionId: "session-1" }
    );

    expect(chain.update).toHaveBeenCalledWith({
      artifact_json: {
        existing: true,
        pending_manual_signal: {
          title: "New source",
          url: "https://example.com",
          notes: "use this",
        },
      },
      updated_at: expect.any(String),
    });
    expect(result).toMatchObject({
      ok: true,
      awaiting_human_confirmation: true,
      pending_manual_signal: {
        title: "New source",
        url: "https://example.com",
        notes: "use this",
      },
    });
  });

  it("saves working artifact draft with aliased outline key", async () => {
    const supabase = createMockSupabase();
    const chain = supabase._setResult("brainstorm_sessions", {
      data: { artifact_json: { prior: "value" } },
      error: null,
    });

    const result = await executeBrainstormTool(
      supabase as never,
      "ws-123",
      "save_artifact_draft",
      {
        working_outline: "Outline v1",
        key_claims: ["claim-1"],
        cited_signal_ids: ["sig-1"],
        thesis: "Core thesis",
      },
      { sessionId: "session-1" }
    );

    expect(chain.update).toHaveBeenCalledWith({
      artifact_json: {
        prior: "value",
        working_artifact: {
          working_outline: "Outline v1",
          key_claims: ["claim-1"],
          cited_signal_ids: ["sig-1"],
          thesis: "Core thesis",
          saved_at: expect.any(String),
        },
      },
      updated_at: expect.any(String),
    });
    expect(result).toMatchObject({
      ok: true,
      artifact: {
        working_outline: "Outline v1",
        key_claims: ["claim-1"],
        cited_signal_ids: ["sig-1"],
        thesis: "Core thesis",
      },
    });
  });

  it("throws for unknown tool names", async () => {
    const supabase = createMockSupabase();
    await expect(
      executeBrainstormTool(supabase as never, "ws-123", "nope", {}, {})
    ).rejects.toThrow("Unknown tool: nope");
  });
});
