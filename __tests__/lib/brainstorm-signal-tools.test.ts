import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabase } from "../api/helpers";
import { brainstormQuerySignals, executeBrainstormTool } from "@/lib/brainstorm/signal-tools";
import { runCadenceIngest } from "@/lib/research/runCadenceIngest";

vi.mock("@/lib/research/runCadenceIngest", () => ({
  runCadenceIngest: vi.fn(),
}));

const mockRunCadenceIngest = vi.mocked(runCadenceIngest);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("brainstormQuerySignals", () => {
  it("clamps limits and applies sanitized optional filters", async () => {
    const supabase = createMockSupabase();
    const chain = supabase._setResult("signals", {
      data: [{ id: "sig-1", title: "OAuth signal" }],
      error: null,
    });

    const result = await brainstormQuerySignals(supabase as never, "ws-123", {
      q: "OAuth, 100%",
      limit: 500,
      directive_id: " directive-1 ",
      since_days: 7,
    });

    expect(result).toEqual({ signals: [{ id: "sig-1", title: "OAuth signal" }], count: 1 });
    expect(chain.limit).toHaveBeenCalledWith(50);
    expect(chain.eq).toHaveBeenCalledWith("directive_id", "directive-1");
    expect(chain.gte).toHaveBeenCalledWith("captured_at", expect.any(String));
    expect(chain.ilike).toHaveBeenCalledWith("title", "%OAuth  100\\%%");
  });

  it("uses safe defaults without optional filters", async () => {
    const supabase = createMockSupabase();
    const chain = supabase._setResult("signals", { data: [], error: null });

    await brainstormQuerySignals(supabase as never, "ws-123", {
      limit: -4,
      directive_id: "   ",
      since_days: 0,
      q: "   ",
    });

    expect(chain.limit).toHaveBeenCalledWith(1);
    expect(chain.eq).toHaveBeenCalledWith("workspace_id", "ws-123");
    expect(chain.eq).not.toHaveBeenCalledWith("directive_id", expect.anything());
    expect(chain.gte).not.toHaveBeenCalled();
    expect(chain.ilike).not.toHaveBeenCalled();
  });
});

describe("executeBrainstormTool", () => {
  it("normalizes trigger_signal_ingest arguments before running ingest", async () => {
    const supabase = createMockSupabase();
    mockRunCadenceIngest.mockResolvedValue({
      ok: true,
      inserted: 2,
      skipped: 1,
      details: [{ feed: "x", inserted: 2, skipped: 1 }],
      run_id: "run-1",
    });

    const result = await executeBrainstormTool(
      supabase as never,
      "ws-123",
      "trigger_signal_ingest",
      { cadence: "monthly", limitPerFeed: 100 }
    );

    expect(mockRunCadenceIngest).toHaveBeenCalledWith(supabase, "ws-123", "daily", 30, {
      source: "brainstorm_tool_trigger_signal_ingest",
    });
    expect(result).toEqual({
      ok: true,
      cadence: "daily",
      limit_per_feed: 30,
      inserted: 2,
      skipped: 1,
      details: [{ feed: "x", inserted: 2, skipped: 1 }],
      error: undefined,
      run_id: "run-1",
    });
  });

  it("requires a session for manual signal proposals", async () => {
    const supabase = createMockSupabase();

    await expect(
      executeBrainstormTool(supabase as never, "ws-123", "propose_manual_signal", {
        title: "Manual signal",
      })
    ).rejects.toThrow("requires an active brainstorm session");
  });
});
