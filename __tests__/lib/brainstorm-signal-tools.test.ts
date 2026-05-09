import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  brainstormQuerySignals,
  executeBrainstormTool,
} from "@/lib/brainstorm/signal-tools";
import { runCadenceIngest } from "@/lib/research/runCadenceIngest";

vi.mock("@/lib/research/runCadenceIngest", () => ({
  runCadenceIngest: vi.fn(),
}));

type QueryResult = { data: unknown; error: { message: string } | null };

class MockQuery {
  select = vi.fn(() => this);
  insert = vi.fn(() => this);
  update = vi.fn(() => this);
  eq = vi.fn(() => this);
  gte = vi.fn(() => this);
  ilike = vi.fn(() => this);
  order = vi.fn(() => this);
  limit = vi.fn(() => this);
  maybeSingle = vi.fn(async () => this.result);

  constructor(private readonly result: QueryResult = { data: null, error: null }) {}

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.result).then(onfulfilled, onrejected);
  }
}

function createQueuedSupabase(queries: MockQuery[]) {
  return {
    from: vi.fn(() => {
      const query = queries.shift();
      if (!query) throw new Error("Unexpected Supabase query");
      return query;
    }),
  } as unknown as SupabaseClient;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("brainstorm signal tools", () => {
  it("keeps signal search workspace-scoped while clamping limits and escaping search text", async () => {
    const query = new MockQuery({
      data: [{ id: "sig-1", title: "OAuth regression" }],
      error: null,
    });
    const supabase = createQueuedSupabase([query]);

    const result = await brainstormQuerySignals(supabase, "workspace-1", {
      q: "OAuth%, breach",
      limit: 999,
      sinceDays: 14,
      directive_id: "directive-1",
    });

    expect(result).toEqual({
      signals: [{ id: "sig-1", title: "OAuth regression" }],
      count: 1,
    });
    expect(query.eq).toHaveBeenCalledWith("workspace_id", "workspace-1");
    expect(query.eq).toHaveBeenCalledWith("directive_id", "directive-1");
    expect(query.limit).toHaveBeenCalledWith(50);
    expect(query.ilike).toHaveBeenCalledWith("title", "%OAuth\\%  breach%");
    expect(query.gte).toHaveBeenCalledWith("captured_at", expect.any(String));
  });

  it("merges proposed manual signals into the session artifact for human confirmation", async () => {
    const selectSession = new MockQuery({
      data: { artifact_json: { existing: true } },
      error: null,
    });
    const updateSession = new MockQuery({ data: null, error: null });
    const supabase = createQueuedSupabase([selectSession, updateSession]);

    const result = await executeBrainstormTool(
      supabase,
      "workspace-1",
      "propose_manual_signal",
      {
        title: "  New manual source  ",
        url: " https://example.com/signal ",
        notes: " Important context ",
      },
      { sessionId: "session-1" }
    );

    expect(result).toEqual({
      ok: true,
      awaiting_human_confirmation: true,
      pending_manual_signal: {
        title: "New manual source",
        url: "https://example.com/signal",
        notes: "Important context",
      },
      hint: expect.stringContaining("Insert signal"),
    });
    expect(updateSession.update).toHaveBeenCalledWith({
      artifact_json: {
        existing: true,
        pending_manual_signal: {
          title: "New manual source",
          url: "https://example.com/signal",
          notes: "Important context",
        },
      },
      updated_at: expect.any(String),
    });
    expect(updateSession.eq).toHaveBeenCalledWith("id", "session-1");
    expect(updateSession.eq).toHaveBeenCalledWith("workspace_id", "workspace-1");
  });

  it("normalizes triggered ingest options before delegating to cadence ingest", async () => {
    vi.mocked(runCadenceIngest).mockResolvedValue({
      ok: true,
      inserted: 3,
      skipped: 1,
      details: [{ feed: "identity", inserted: 3, skipped: 1 }],
      run_id: "run-1",
    });
    const supabase = createQueuedSupabase([]);

    const result = await executeBrainstormTool(
      supabase,
      "workspace-1",
      "trigger_signal_ingest",
      { cadence: "monthly", limit_per_feed: 100 }
    );

    expect(runCadenceIngest).toHaveBeenCalledWith(
      supabase,
      "workspace-1",
      "daily",
      30,
      { source: "brainstorm_tool_trigger_signal_ingest" }
    );
    expect(result).toMatchObject({
      ok: true,
      cadence: "daily",
      limit_per_feed: 30,
      inserted: 3,
      skipped: 1,
      run_id: "run-1",
    });
  });
});
