import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabase } from "../api/helpers";

const mockRunCadenceIngest = vi.fn();

vi.mock("@/lib/research/runCadenceIngest", () => ({
  runCadenceIngest: (...args: unknown[]) => mockRunCadenceIngest(...args),
}));

import {
  brainstormQuerySignals,
  executeBrainstormTool,
} from "@/lib/brainstorm/signal-tools";

const mockSupabase = createMockSupabase();

beforeEach(() => {
  vi.clearAllMocks();
  mockSupabase._chains.clear();
});

describe("brainstorm signal tools", () => {
  it("bounds query limits and escapes title search filters", async () => {
    const chain = mockSupabase._setResult("signals", {
      data: [
        {
          id: "sig-1",
          title: "Margin pressure",
          captured_at: "2026-05-01T00:00:00.000Z",
        },
      ],
      error: null,
    });

    const result = await brainstormQuerySignals(
      mockSupabase,
      "ws-123",
      {
        q: "100%, growth",
        limit: 500,
        since_days: 7,
        directive_id: " directive-1 ",
      }
    );

    expect(result).toEqual({
      signals: [
        {
          id: "sig-1",
          title: "Margin pressure",
          captured_at: "2026-05-01T00:00:00.000Z",
        },
      ],
      count: 1,
    });
    expect(chain.eq).toHaveBeenCalledWith("workspace_id", "ws-123");
    expect(chain.eq).toHaveBeenCalledWith("directive_id", "directive-1");
    expect(chain.limit).toHaveBeenCalledWith(50);
    expect(chain.gte).toHaveBeenCalledWith("captured_at", expect.any(String));
    expect(chain.ilike).toHaveBeenCalledWith("title", "%100\\%  growth%");
  });

  it("stores a pending manual signal on the active session only after validation", async () => {
    const chain = mockSupabase._setResult("brainstorm_sessions", {
      data: { artifact_json: { working_artifact: { thesis: "Existing" } } },
      error: null,
    });

    const result = await executeBrainstormTool(
      mockSupabase,
      "ws-123",
      "propose_manual_signal",
      { title: "  New signal  ", url: "  https://example.com/a  ", notes: "  Watch this  " },
      { sessionId: "session-1" }
    );

    expect(result).toMatchObject({
      ok: true,
      awaiting_human_confirmation: true,
      pending_manual_signal: {
        title: "New signal",
        url: "https://example.com/a",
        notes: "Watch this",
      },
    });
    expect(chain.update).toHaveBeenCalledWith({
      artifact_json: {
        working_artifact: { thesis: "Existing" },
        pending_manual_signal: {
          title: "New signal",
          url: "https://example.com/a",
          notes: "Watch this",
        },
      },
      updated_at: expect.any(String),
    });
    expect(chain.eq).toHaveBeenCalledWith("id", "session-1");
    expect(chain.eq).toHaveBeenCalledWith("workspace_id", "ws-123");
  });

  it("requires an active session before writing manual signal artifacts", async () => {
    await expect(
      executeBrainstormTool(
        mockSupabase,
        "ws-123",
        "propose_manual_signal",
        { title: "New signal" }
      )
    ).rejects.toThrow("requires an active brainstorm session");

    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  it("normalizes trigger_signal_ingest parameters and returns ingest details", async () => {
    mockRunCadenceIngest.mockResolvedValueOnce({
      ok: true,
      inserted: 2,
      skipped: 1,
      details: [{ directive_id: "dir-1" }],
      run_id: "run-1",
    });

    const result = await executeBrainstormTool(
      mockSupabase,
      "ws-123",
      "trigger_signal_ingest",
      { cadence: "monthly", limit_per_feed: 200 }
    );

    expect(mockRunCadenceIngest).toHaveBeenCalledWith(
      mockSupabase,
      "ws-123",
      "daily",
      30,
      { source: "brainstorm_tool_trigger_signal_ingest" }
    );
    expect(result).toEqual({
      ok: true,
      cadence: "daily",
      limit_per_feed: 30,
      inserted: 2,
      skipped: 1,
      details: [{ directive_id: "dir-1" }],
      error: undefined,
      run_id: "run-1",
    });
  });
});
