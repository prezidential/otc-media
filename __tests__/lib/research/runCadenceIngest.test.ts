import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const { parseURLMock } = vi.hoisted(() => ({
  parseURLMock: vi.fn(),
}));

vi.mock("rss-parser", () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      parseURL: parseURLMock,
    })),
  };
});

vi.mock("@/lib/research/rssFeedMap", () => ({
  RSS_FEED_MAP: {
    "Identity + AI": ["https://feeds.example/identity-ai.xml"],
  },
}));

import { runCadenceIngest } from "@/lib/research/runCadenceIngest";

type QueryResult = {
  data: unknown;
  error: { message: string } | null;
};

type QueuedQuery = {
  table: string;
  result: QueryResult;
};

type QueryRecord = {
  table: string;
  selects: unknown[][];
  inserts: unknown[][];
  updates: unknown[][];
  filters: { method: string; args: unknown[] }[];
};

function createQuery(record: QueryRecord, result: QueryResult) {
  const query: Record<string, unknown> = {};

  query.select = vi.fn((...args: unknown[]) => {
    record.selects.push(args);
    return query;
  });
  query.insert = vi.fn((...args: unknown[]) => {
    record.inserts.push(args);
    return query;
  });
  query.update = vi.fn((...args: unknown[]) => {
    record.updates.push(args);
    return query;
  });

  for (const method of ["eq", "order", "limit"]) {
    query[method] = vi.fn((...args: unknown[]) => {
      record.filters.push({ method, args });
      return query;
    });
  }

  query.single = vi.fn().mockResolvedValue(result);
  query.maybeSingle = vi.fn().mockResolvedValue(result);
  query.then = (resolve: (value: QueryResult) => unknown, reject?: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);

  return query;
}

function createQueuedSupabase(queue: QueuedQuery[]) {
  const records: QueryRecord[] = [];
  const pending = [...queue];

  const supabase = {
    from: vi.fn((table: string) => {
      const next = pending.shift();
      if (!next) {
        throw new Error(`Unexpected Supabase query for ${table}`);
      }
      if (next.table !== table) {
        throw new Error(`Expected Supabase query for ${next.table}, got ${table}`);
      }

      const record: QueryRecord = {
        table,
        selects: [],
        inserts: [],
        updates: [],
        filters: [],
      };
      records.push(record);
      return createQuery(record, next.result);
    }),
  };

  return {
    supabase: supabase as unknown as SupabaseClient,
    from: supabase.from,
    records,
    pending,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  parseURLMock.mockReset();
});

describe("runCadenceIngest", () => {
  it("creates a run, ingests valid feed items, and counts skipped invalid or duplicate items", async () => {
    parseURLMock.mockResolvedValue({
      title: "Identity Feed",
      items: [
        {
          title: " First story ",
          link: " https://example.com/first ",
          isoDate: "2026-01-01T12:00:00.000Z",
          contentSnippet: "Useful summary",
        },
        {
          title: "Duplicate story",
          link: "https://example.com/duplicate",
          content: "Fallback raw content",
        },
        {
          title: "",
          link: "https://example.com/missing-title",
        },
      ],
    });

    const { supabase, records, pending } = createQueuedSupabase([
      { table: "runs", result: { data: { id: "run-1" }, error: null } },
      {
        table: "research_directives",
        result: { data: [{ id: "dir-1", name: "Identity + AI" }], error: null },
      },
      { table: "sources", result: { data: null, error: null } },
      { table: "sources", result: { data: { id: "src-1" }, error: null } },
      { table: "signals", result: { data: null, error: null } },
      { table: "signals", result: { data: null, error: { message: "duplicate key" } } },
      { table: "runs", result: { data: null, error: null } },
    ]);

    const result = await runCadenceIngest(supabase, "ws-1", "daily", 3, {
      source: "test",
    });

    expect(result).toMatchObject({
      ok: true,
      inserted: 1,
      skipped: 2,
      run_id: "run-1",
      details: [
        {
          directive: "Identity + AI",
          feedUrl: "https://feeds.example/identity-ai.xml",
          inserted: 1,
          skipped: 2,
        },
      ],
    });
    expect(pending).toHaveLength(0);
    expect(parseURLMock).toHaveBeenCalledWith("https://feeds.example/identity-ai.xml");

    const runInsert = records[0];
    expect(runInsert.inserts[0][0]).toMatchObject({
      workspace_id: "ws-1",
      run_type: "directive_ingest",
      status: "initiated",
      input_refs_json: {
        cadence: "daily",
        limitPerFeed: 3,
        source: "test",
      },
    });

    const sourceInsert = records[3];
    expect(sourceInsert.inserts[0][0]).toMatchObject({
      workspace_id: "ws-1",
      name: "Identity Feed",
      type: "rss",
      base_url: "https://feeds.example/identity-ai.xml",
    });

    const firstSignalInsert = records[4];
    expect(firstSignalInsert.inserts[0][0]).toMatchObject({
      workspace_id: "ws-1",
      source_id: "src-1",
      directive_id: "dir-1",
      url: "https://example.com/first",
      title: "First story",
      publisher: "Identity Feed",
      published_at: "2026-01-01T12:00:00.000Z",
      raw_text: "Useful summary",
      normalized_summary: "Useful summary",
      trust_score: 0.7,
      tags_json: ["Identity + AI"],
    });
    expect(firstSignalInsert.inserts[0][0]).toHaveProperty("dedupe_hash");

    const runUpdate = records[6];
    expect(runUpdate.updates[0][0]).toMatchObject({
      status: "completed",
      output_refs_json: {
        inserted: 1,
        skipped: 2,
        details: result.details,
      },
    });
    expect(runUpdate.filters).toContainEqual({ method: "eq", args: ["id", "run-1"] });
  });

  it("marks the run failed when a feed cannot be parsed", async () => {
    parseURLMock.mockRejectedValue(new Error("feed timeout"));

    const { supabase, records, pending } = createQueuedSupabase([
      { table: "runs", result: { data: { id: "run-2" }, error: null } },
      {
        table: "research_directives",
        result: { data: [{ id: "dir-1", name: "Identity + AI" }], error: null },
      },
      { table: "runs", result: { data: null, error: null } },
    ]);

    const result = await runCadenceIngest(supabase, "ws-1", "daily", 2);

    expect(result).toMatchObject({
      ok: false,
      inserted: 0,
      skipped: 0,
      details: [],
      error: "feed timeout",
      run_id: "run-2",
    });
    expect(pending).toHaveLength(0);

    const runUpdate = records[2];
    expect(runUpdate.updates[0][0]).toMatchObject({
      status: "failed",
      error_message: "feed timeout",
    });
    expect(runUpdate.filters).toContainEqual({ method: "eq", args: ["id", "run-2"] });
  });

  it("returns a startup failure when the audit run cannot be created", async () => {
    const { supabase, pending } = createQueuedSupabase([
      { table: "runs", result: { data: null, error: { message: "runs insert denied" } } },
    ]);

    const result = await runCadenceIngest(supabase, "ws-1", "weekly", 5);

    expect(result).toEqual({
      ok: false,
      inserted: 0,
      skipped: 0,
      details: [],
      error: "runs insert denied",
      run_id: "",
    });
    expect(pending).toHaveLength(0);
    expect(parseURLMock).not.toHaveBeenCalled();
  });
});
