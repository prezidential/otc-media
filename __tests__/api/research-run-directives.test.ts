import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeJsonRequest } from "./helpers";

const mockSupabase = { from: vi.fn() };
const mockRunCadenceIngest = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => mockSupabase,
}));

vi.mock("@/lib/research/runCadenceIngest", () => ({
  runCadenceIngest: (...args: unknown[]) => mockRunCadenceIngest(...args),
}));

import { POST } from "@/app/api/research/run-directives/route";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("WORKSPACE_ID", "ws-123");
});

describe("POST /api/research/run-directives", () => {
  it("returns 400 when cadence is missing/invalid", async () => {
    const res = await POST(makeJsonRequest("http://localhost:3000/api/research/run-directives", { cadence: "hourly" }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toContain("cadence required");
    expect(mockRunCadenceIngest).not.toHaveBeenCalled();
  });

  it("uses default limitPerFeed and returns 500 on hard start failure", async () => {
    mockRunCadenceIngest.mockResolvedValueOnce({
      ok: false,
      inserted: 0,
      skipped: 0,
      details: [],
      error: "Failed to create run",
      run_id: "",
    });

    const res = await POST(
      makeJsonRequest("http://localhost:3000/api/research/run-directives", {
        cadence: "daily",
        limitPerFeed: "not-a-number",
      })
    );
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toBe("Failed to create run");
    expect(mockRunCadenceIngest).toHaveBeenCalledWith(mockSupabase, "ws-123", "daily", 15, {
      source: "api_research_run_directives",
    });
  });

  it("returns ok=false payload when run exists but ingest had feed-level failures", async () => {
    mockRunCadenceIngest.mockResolvedValueOnce({
      ok: false,
      inserted: 2,
      skipped: 3,
      details: [{ directive: "Identity + AI", feedUrl: "https://feed.example/rss", inserted: 2, skipped: 3 }],
      error: "Feed timeout",
      run_id: "run-1",
    });

    const res = await POST(
      makeJsonRequest("http://localhost:3000/api/research/run-directives", {
        cadence: "weekly",
        limitPerFeed: 9,
      })
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({
      ok: false,
      inserted: 2,
      skipped: 3,
      details: [{ directive: "Identity + AI", feedUrl: "https://feed.example/rss", inserted: 2, skipped: 3 }],
      error: "Feed timeout",
    });
  });

  it("returns ok=true payload for successful ingest runs", async () => {
    mockRunCadenceIngest.mockResolvedValueOnce({
      ok: true,
      inserted: 7,
      skipped: 1,
      details: [{ directive: "Identity + AI", feedUrl: "https://feed.example/rss", inserted: 7, skipped: 1 }],
      run_id: "run-2",
    });

    const res = await POST(
      makeJsonRequest("http://localhost:3000/api/research/run-directives", {
        cadence: "daily",
        limitPerFeed: 11,
      })
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({
      ok: true,
      inserted: 7,
      skipped: 1,
      details: [{ directive: "Identity + AI", feedUrl: "https://feed.example/rss", inserted: 7, skipped: 1 }],
    });
  });
});
