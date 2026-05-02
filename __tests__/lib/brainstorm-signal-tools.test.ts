import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  brainstormGetSignal,
  brainstormListRecentDrafts,
  brainstormQuerySignals,
  executeBrainstormTool,
} from "@/lib/brainstorm/signal-tools";
import { runCadenceIngest } from "@/lib/research/runCadenceIngest";

vi.mock("@/lib/research/runCadenceIngest", () => ({
  runCadenceIngest: vi.fn(),
}));

type QueryChain = {
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  gte: ReturnType<typeof vi.fn>;
  ilike: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
  then: (resolve: (value: { data: unknown; error: unknown }) => void) => void;
};

function createQueryChain(result: { data: unknown; error: unknown }): QueryChain {
  const chain = {} as QueryChain;
  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.order = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.gte = vi.fn().mockReturnValue(chain);
  chain.ilike = vi.fn().mockReturnValue(chain);
  chain.maybeSingle = vi.fn().mockResolvedValue(result);
  chain.then = (resolve) => resolve(result);
  return chain;
}

function supabaseForTable(table: string, chain: QueryChain) {
  return {
    from: vi.fn((requested: string) => {
      if (requested !== table) {
        throw new Error(`Unexpected table: ${requested}`);
      }
      return chain;
    }),
  } as unknown as SupabaseClient;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("brainstorm signal tools", () => {
  it("queries signals with workspace scoping, safe filters, and bounded limits", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-02T10:00:00.000Z"));
    const signals = [{ id: "sig-1", title: "OAuth risk" }];
    const chain = createQueryChain({ data: signals, error: null });

    const result = await brainstormQuerySignals(supabaseForTable("signals", chain), "ws-123", {
      q: "100%, oauth",
      limit: 999,
      since_days: 7,
      directive_id: "dir-1",
    });

    expect(result).toEqual({ signals, count: 1 });
    expect(chain.select).toHaveBeenCalledWith(
      "id,title,url,publisher,published_at,captured_at,normalized_summary,directive_id"
    );
    expect(chain.eq).toHaveBeenCalledWith("workspace_id", "ws-123");
    expect(chain.eq).toHaveBeenCalledWith("directive_id", "dir-1");
    expect(chain.limit).toHaveBeenCalledWith(50);
    expect(chain.gte).toHaveBeenCalledWith("captured_at", "2026-04-25T10:00:00.000Z");
    expect(chain.ilike).toHaveBeenCalledWith("title", "%100\\%  oauth%");
  });

  it("returns a workspace-safe not-found payload for missing signals", async () => {
    const chain = createQueryChain({ data: null, error: null });

    const result = await brainstormGetSignal(supabaseForTable("signals", chain), "ws-123", {
      id: "sig-missing",
    });

    expect(result).toEqual({ error: "Signal not found or not in this workspace." });
    expect(chain.eq).toHaveBeenCalledWith("workspace_id", "ws-123");
    expect(chain.eq).toHaveBeenCalledWith("id", "sig-missing");
  });

  it("summarizes recent drafts without leaking full draft JSON", async () => {
    const chain = createQueryChain({
      data: [
        { id: "draft-1", created_at: "2026-05-01T00:00:00.000Z", content_json: { title: "Real title" } },
        { id: "draft-2", created_at: "2026-05-02T00:00:00.000Z", content_json: { body: "No title" } },
      ],
      error: null,
    });

    const result = await brainstormListRecentDrafts(supabaseForTable("issue_drafts", chain), "ws-123", {
      limit: -20,
    });

    expect(result).toEqual({
      drafts: [
        { id: "draft-1", created_at: "2026-05-01T00:00:00.000Z", title: "Real title" },
        { id: "draft-2", created_at: "2026-05-02T00:00:00.000Z", title: "(untitled)" },
      ],
    });
    expect(chain.eq).toHaveBeenCalledWith("workspace_id", "ws-123");
    expect(chain.limit).toHaveBeenCalledWith(1);
  });

  it("dispatches trigger_signal_ingest with clamped limits and source metadata", async () => {
    vi.mocked(runCadenceIngest).mockResolvedValue({
      ok: true,
      inserted: 4,
      skipped: 2,
      details: [{ directive: "Identity + AI", feedUrl: "https://example.com/feed", inserted: 4, skipped: 2 }],
      run_id: "run-1",
    });
    const supabase = { from: vi.fn() } as unknown as SupabaseClient;

    const result = await executeBrainstormTool(supabase, "ws-123", "trigger_signal_ingest", {
      cadence: "weekly",
      limit_per_feed: 100,
    });

    expect(runCadenceIngest).toHaveBeenCalledWith(supabase, "ws-123", "weekly", 30, {
      source: "brainstorm_tool_trigger_signal_ingest",
    });
    expect(result).toMatchObject({
      ok: true,
      cadence: "weekly",
      limit_per_feed: 30,
      inserted: 4,
      skipped: 2,
      run_id: "run-1",
    });
  });
});
