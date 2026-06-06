import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockSupabase } from "../../api/helpers";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  loadHistory,
  saveHistory,
  updateHistory,
  type KpiHistory,
  type MetricSnapshot,
} from "@/lib/subscriber-health/history";

const mockSupabase = createMockSupabase();
const supabase = mockSupabase as unknown as SupabaseClient;

beforeEach(() => {
  vi.clearAllMocks();
  mockSupabase._chains.clear();
});

describe("loadHistory", () => {
  it("returns empty object when no rows", async () => {
    mockSupabase._setResult("subscriber_health_history", { data: [], error: null });
    expect(await loadHistory("ws-1", supabase)).toEqual({});
  });

  it("returns empty object on error", async () => {
    mockSupabase._setResult("subscriber_health_history", { data: null, error: { message: "x" } });
    expect(await loadHistory("ws-1", supabase)).toEqual({});
  });

  it("maps rows into per-metric streak entries", async () => {
    mockSupabase._setResult("subscriber_health_history", {
      data: [
        { metric: "openRate", consecutive_weeks_below: 2, last_status: "red" },
        { metric: "clickRate", consecutive_weeks_below: 0, last_status: "green" },
      ],
      error: null,
    });
    const history = await loadHistory("ws-1", supabase);
    expect(history.openRate).toEqual({ consecutiveWeeksBelow: 2, lastStatus: "red" });
    expect(history.clickRate).toEqual({ consecutiveWeeksBelow: 0, lastStatus: "green" });
  });
});

describe("updateHistory (pure counter logic)", () => {
  it("increments consecutiveWeeksBelow when metric is red", () => {
    const history: KpiHistory = { openRate: { consecutiveWeeksBelow: 1, lastStatus: "red" } };
    const entry = updateHistory(history, "openRate", "red");
    expect(entry.consecutiveWeeksBelow).toBe(2);
    expect(entry.lastStatus).toBe("red");
  });

  it("resets consecutiveWeeksBelow to 0 when metric recovers", () => {
    const history: KpiHistory = { openRate: { consecutiveWeeksBelow: 4, lastStatus: "red" } };
    const entry = updateHistory(history, "openRate", "green");
    expect(entry.consecutiveWeeksBelow).toBe(0);
    expect(entry.lastStatus).toBe("green");
  });

  it("preserves other metric history when one metric changes", () => {
    const history: KpiHistory = {
      openRate: { consecutiveWeeksBelow: 2, lastStatus: "red" },
      clickRate: { consecutiveWeeksBelow: 5, lastStatus: "red" },
    };
    updateHistory(history, "openRate", "green");
    expect(history.clickRate).toEqual({ consecutiveWeeksBelow: 5, lastStatus: "red" });
  });

  it("initializes from zero when metric not seen before", () => {
    const history: KpiHistory = {};
    expect(updateHistory(history, "openRate", "red").consecutiveWeeksBelow).toBe(1);
  });
});

describe("saveHistory", () => {
  it("upserts one row per metric keyed on workspace_id,metric", async () => {
    const chain = mockSupabase._setResult("subscriber_health_history", { data: null, error: null });
    const snapshots: Partial<Record<string, MetricSnapshot>> = {
      openRate: { value: 58, status: "yellow", consecutiveWeeksBelow: 0, week: 23 },
      clickRate: { value: 0.5, status: "red", consecutiveWeeksBelow: 3, week: 23 },
    };
    await saveHistory("ws-1", snapshots as Partial<Record<never, MetricSnapshot>>, supabase);

    expect(chain.upsert).toHaveBeenCalledTimes(1);
    const [rows, opts] = chain.upsert.mock.calls[0];
    expect(opts).toEqual({ onConflict: "workspace_id,metric" });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      workspace_id: "ws-1",
      metric: "openRate",
      last_value: 58,
      last_week: 23,
      consecutive_weeks_below: 0,
      last_status: "yellow",
    });
  });

  it("is a no-op when there are no snapshots", async () => {
    const chain = mockSupabase._setResult("subscriber_health_history", { data: null, error: null });
    await saveHistory("ws-1", {}, supabase);
    expect(chain.upsert).not.toHaveBeenCalled();
  });
});
