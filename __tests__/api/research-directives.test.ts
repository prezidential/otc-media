import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockSupabase } from "./helpers";

const mockSupabase = createMockSupabase();
const runCadenceIngestMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => mockSupabase,
}));
vi.mock("@/lib/research/runCadenceIngest", () => ({
  runCadenceIngest: runCadenceIngestMock,
}));

import { GET } from "@/app/api/research/list-directives/route";
import { POST as SeedPOST } from "@/app/api/research/seed-directives/route";
import { POST as RunPOST } from "@/app/api/research/run-directives/route";

beforeEach(() => {
  vi.stubEnv("WORKSPACE_ID", "ws-123");
  vi.clearAllMocks();
});

describe("GET /api/research/list-directives", () => {
  it("returns directives", async () => {
    const directives = [
      { id: "d-1", name: "Identity + AI", cadence: "daily", active: true },
    ];
    mockSupabase._setResult("research_directives", { data: directives, error: null });

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.directives).toEqual(directives);
  });

  it("returns 500 on error", async () => {
    mockSupabase._setResult("research_directives", {
      data: null,
      error: { message: "fail" },
    });

    const res = await GET();
    expect(res.status).toBe(500);
  });
});

describe("POST /api/research/seed-directives", () => {
  it("returns inserted: 0 when directives already exist", async () => {
    const chain = mockSupabase._setResult("research_directives", {
      data: [{ id: "existing" }],
      error: null,
    });
    chain.limit = vi.fn().mockResolvedValue({ data: [{ id: "existing" }], error: null });

    const res = await SeedPOST();
    const json = await res.json();

    expect(json.inserted).toBe(0);
  });

  it("returns 500 on fetch error", async () => {
    const chain = mockSupabase._setResult("research_directives", {
      data: null,
      error: null,
    });
    chain.limit = vi.fn().mockResolvedValue({ data: null, error: { message: "fetch fail" } });

    const res = await SeedPOST();
    expect(res.status).toBe(500);
  });
});

describe("POST /api/research/run-directives", () => {
  it("returns 400 when cadence is missing or invalid", async () => {
    const res = await RunPOST(
      new Request("http://localhost/api/research/run-directives", {
        method: "POST",
        body: JSON.stringify({ cadence: "monthly" }),
      })
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("cadence required");
    expect(runCadenceIngestMock).not.toHaveBeenCalled();
  });

  it("delegates valid requests to cadence ingest with audit metadata", async () => {
    runCadenceIngestMock.mockResolvedValue({
      ok: true,
      inserted: 2,
      skipped: 1,
      details: [{ directive: "Identity + AI", feedUrl: "https://example.com/rss", inserted: 2, skipped: 1 }],
      run_id: "run-123",
    });

    const res = await RunPOST(
      new Request("http://localhost/api/research/run-directives", {
        method: "POST",
        body: JSON.stringify({ cadence: "daily", limitPerFeed: 3 }),
      })
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({
      ok: true,
      inserted: 2,
      skipped: 1,
      details: [{ directive: "Identity + AI", feedUrl: "https://example.com/rss", inserted: 2, skipped: 1 }],
    });
    expect(runCadenceIngestMock).toHaveBeenCalledWith(mockSupabase, "ws-123", "daily", 3, {
      source: "api_research_run_directives",
    });
  });

  it("returns 500 when cadence ingest cannot create its audit run", async () => {
    runCadenceIngestMock.mockResolvedValue({
      ok: false,
      inserted: 0,
      skipped: 0,
      details: [],
      error: "Failed to create run",
      run_id: "",
    });

    const res = await RunPOST(
      new Request("http://localhost/api/research/run-directives", {
        method: "POST",
        body: JSON.stringify({ cadence: "weekly" }),
      })
    );

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("Failed to create run");
  });
});
