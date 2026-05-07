import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  brainstormQuerySignals,
  executeBrainstormTool,
} from "@/lib/brainstorm/signal-tools";

type Result = { data: unknown; error: { message: string } | null };

function createChain(finalResult: Result = { data: null, error: null }) {
  const chain = {} as Record<string, ReturnType<typeof vi.fn>>;
  const methods = ["select", "update", "eq", "gte", "ilike", "order", "limit"] as const;
  for (const method of methods) {
    chain[method] = vi.fn().mockReturnValue(chain);
  }
  chain.maybeSingle = vi.fn().mockResolvedValue(finalResult);
  (chain as unknown as { then: (resolve: (value: Result) => void) => void }).then = (resolve) =>
    resolve(finalResult);
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("brainstorm signal tools", () => {
  it("sanitizes query_signals filters and caps the result limit", async () => {
    const signalRows = [{ id: "signal-1", title: "Identity drift" }];
    const chain = createChain({ data: signalRows, error: null });
    const supabase = { from: vi.fn(() => chain) };

    const result = await brainstormQuerySignals(supabase as never, "ws-123", {
      q: "identity%, access",
      directive_id: "  directive-1  ",
      since_days: 14,
      limit: 999,
    });

    expect(result).toEqual({ signals: signalRows, count: 1 });
    expect(supabase.from).toHaveBeenCalledWith("signals");
    expect(chain.eq).toHaveBeenCalledWith("workspace_id", "ws-123");
    expect(chain.eq).toHaveBeenCalledWith("directive_id", "directive-1");
    expect(chain.limit).toHaveBeenCalledWith(50);
    expect(chain.gte).toHaveBeenCalledWith("captured_at", expect.any(String));
    expect(chain.ilike).toHaveBeenCalledWith("title", "%identity\\%  access%");
  });

  it("rejects manual-signal proposals without an active session", async () => {
    const supabase = { from: vi.fn() };

    await expect(
      executeBrainstormTool(
        supabase as never,
        "ws-123",
        "propose_manual_signal",
        { title: "High-signal customer note" },
        {}
      )
    ).rejects.toThrow("requires an active brainstorm session");
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("trims and stores a pending manual signal while preserving existing artifacts", async () => {
    const sessionChain = createChain({
      data: {
        artifact_json: {
          working_artifact: { thesis: "Already saved" },
        },
      },
      error: null,
    });
    const supabase = { from: vi.fn(() => sessionChain) };

    const result = await executeBrainstormTool(
      supabase as never,
      "ws-123",
      "propose_manual_signal",
      {
        title: "  OAuth grants expanding in CI  ",
        url: "   ",
        notes: "  Field notes from customer calls  ",
      },
      { sessionId: "session-1" }
    );

    expect(result).toMatchObject({
      ok: true,
      awaiting_human_confirmation: true,
      pending_manual_signal: {
        title: "OAuth grants expanding in CI",
        url: undefined,
        notes: "Field notes from customer calls",
      },
    });

    expect(sessionChain.update).toHaveBeenCalledTimes(1);
    const updatePayload = vi.mocked(sessionChain.update).mock.calls[0][0] as Record<string, unknown>;
    expect(updatePayload.artifact_json).toEqual({
      working_artifact: { thesis: "Already saved" },
      pending_manual_signal: {
        title: "OAuth grants expanding in CI",
        url: undefined,
        notes: "Field notes from customer calls",
      },
    });
  });
});
