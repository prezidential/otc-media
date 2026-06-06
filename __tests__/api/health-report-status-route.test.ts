import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockSupabase } from "./helpers";

const mockSupabase = createMockSupabase();
const ctx = { supabase: mockSupabase, workspaceId: "ws-1", userId: "u-1", role: "owner" as const };
const requireWorkspace = vi.fn(async () => ctx as unknown);
vi.mock("@/lib/auth/session", () => ({
  requireWorkspace: () => requireWorkspace(),
}));

import { GET } from "@/app/api/pipelines/health-report/status/route";

beforeEach(() => {
  vi.clearAllMocks();
  mockSupabase._chains.clear();
  requireWorkspace.mockResolvedValue(ctx as unknown);
});

describe("GET /api/pipelines/health-report/status", () => {
  it("merges persisted rows with global KPI targets, in metric order", async () => {
    mockSupabase._setResult("subscriber_health_history", {
      data: [
        {
          metric: "openRate",
          last_value: 58,
          last_week: 23,
          consecutive_weeks_below: 0,
          last_status: "yellow",
          updated_at: "2026-06-04T13:00:00.000Z",
        },
        {
          metric: "weeklyNewSubs",
          last_value: 12,
          last_week: 23,
          consecutive_weeks_below: 0,
          last_status: "green",
          updated_at: "2026-06-04T13:00:00.000Z",
        },
      ],
      error: null,
    });

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    // METRIC_ORDER puts weeklyNewSubs before openRate
    expect(json.metrics.map((m: { key: string }) => m.key)).toEqual(["weeklyNewSubs", "openRate"]);
    const open = json.metrics.find((m: { key: string }) => m.key === "openRate");
    expect(open).toMatchObject({
      label: "Open rate",
      value: 58,
      status: "yellow",
      target: 65,
      warn: 60,
      kind: "standard",
      unit: "percent",
    });
    const subs = json.metrics.find((m: { key: string }) => m.key === "weeklyNewSubs");
    expect(subs).toMatchObject({ unit: "count", target: 10 });
  });

  it("returns an empty metrics array when the pipeline has never run", async () => {
    mockSupabase._setResult("subscriber_health_history", { data: [], error: null });
    const res = await GET();
    expect(await res.json()).toEqual({ metrics: [] });
  });

  it("propagates auth failures from requireWorkspace", async () => {
    requireWorkspace.mockResolvedValue(new Response(null, { status: 401 }));
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 500 when the history query errors", async () => {
    mockSupabase._setResult("subscriber_health_history", { data: null, error: { message: "x" } });
    const res = await GET();
    expect(res.status).toBe(500);
  });
});
