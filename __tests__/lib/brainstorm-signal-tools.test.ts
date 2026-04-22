import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabase } from "../api/helpers";

const mockRunCadenceIngest = vi.fn();

vi.mock("@/lib/research/runCadenceIngest", () => ({
  runCadenceIngest: (...args: unknown[]) => mockRunCadenceIngest(...args),
}));

import {
  brainstormGetSignal,
  brainstormQuerySignals,
  executeBrainstormTool,
} from "@/lib/brainstorm/signal-tools";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("brainstormQuerySignals", () => {
  it("clamps limits and sanitizes query filters", async () => {
    const mockSupabase = createMockSupabase();
    const chain = mockSupabase._setResult("signals", {
      data: [{ id: "sig-1", title: "A" }],
      error: null,
    });

    const result = await brainstormQuerySignals(
      mockSupabase as never,
      "ws-123",
      {
        q: "100%,ai",
        limit: 999,
        since_days: 2,
        directive_id: "dir-1",
      }
    );

    expect(chain.limit).toHaveBeenCalledWith(50);
    expect(chain.eq).toHaveBeenCalledWith("workspace_id", "ws-123");
    expect(chain.eq).toHaveBeenCalledWith("directive_id", "dir-1");
    expect(chain.ilike).toHaveBeenCalledWith("title", "%100\\% ai%");

    const gteCall = chain.gte.mock.calls.find((c: unknown[]) => c[0] === "captured_at");
    expect(gteCall).toBeTruthy();
    expect(typeof gteCall?.[1]).toBe("string");
    expect(Number.isNaN(Date.parse(gteCall?.[1] as string))).toBe(false);

    expect(result).toEqual({
      signals: [{ id: "sig-1", title: "A" }],
      count: 1,
    });
  });
});

describe("brainstormGetSignal", () => {
  it("throws when id is missing", async () => {
    const mockSupabase = createMockSupabase();
    await expect(brainstormGetSignal(mockSupabase as never, "ws-123", {})).rejects.toThrow(
      "get_signal requires params.id"
    );
  });

  it("returns domain error when signal is outside workspace scope", async () => {
    const mockSupabase = createMockSupabase();
    mockSupabase._setResult("signals", { data: null, error: null });
    const result = await brainstormGetSignal(mockSupabase as never, "ws-123", { id: "sig-404" });
    expect(result).toEqual({ error: "Signal not found or not in this workspace." });
  });
});

describe("executeBrainstormTool", () => {
  it("normalizes trigger_signal_ingest cadence and limit bounds", async () => {
    const mockSupabase = createMockSupabase();
    mockRunCadenceIngest.mockResolvedValueOnce({
      ok: true,
      inserted: 4,
      skipped: 1,
      details: [{ directive: "Identity + AI", feedUrl: "https://example.com/rss", inserted: 4, skipped: 1 }],
      run_id: "run-123",
    });

    const result = await executeBrainstormTool(
      mockSupabase as never,
      "ws-123",
      "trigger_signal_ingest",
      { cadence: "invalid", limit_per_feed: 1 }
    );

    expect(mockRunCadenceIngest).toHaveBeenCalledWith(
      mockSupabase,
      "ws-123",
      "daily",
      5,
      { source: "brainstorm_tool_trigger_signal_ingest" }
    );
    expect(result).toEqual({
      ok: true,
      cadence: "daily",
      limit_per_feed: 5,
      inserted: 4,
      skipped: 1,
      details: [{ directive: "Identity + AI", feedUrl: "https://example.com/rss", inserted: 4, skipped: 1 }],
      error: undefined,
      run_id: "run-123",
    });
  });

  it("throws for unknown tools", async () => {
    const mockSupabase = createMockSupabase();
    await expect(
      executeBrainstormTool(mockSupabase as never, "ws-123", "does_not_exist", {})
    ).rejects.toThrow("Unknown tool: does_not_exist");
  });
});
