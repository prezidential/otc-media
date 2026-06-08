import { describe, it, expect } from "vitest";
import { createMockSupabase } from "../api/helpers";
import { executeBrainstormTool } from "@/lib/brainstorm/signal-tools";
import type { SupabaseClient } from "@supabase/supabase-js";

const WS = "ws-1";

describe("get_audience_health brainstorm tool", () => {
  it("reports unavailable when there is no health history", async () => {
    const supabase = createMockSupabase();
    supabase._setResult("subscriber_health_history", { data: [], error: null });

    const out = (await executeBrainstormTool(
      supabase as unknown as SupabaseClient,
      WS,
      "get_audience_health",
      {}
    )) as { available: boolean; note?: string };

    expect(out.available).toBe(false);
    expect(out.note).toMatch(/health/i);
  });

  it("returns a summary + per-metric rows when history exists", async () => {
    const supabase = createMockSupabase();
    supabase._setResult("subscriber_health_history", {
      data: [
        { metric: "open_rate", last_value: 64, last_status: "green", consecutive_weeks_below: 0, updated_at: "2026-06-08T00:00:00Z" },
        { metric: "click_rate", last_value: 1.4, last_status: "red", consecutive_weeks_below: 3, updated_at: "2026-06-08T00:00:00Z" },
      ],
      error: null,
    });

    const out = (await executeBrainstormTool(
      supabase as unknown as SupabaseClient,
      WS,
      "get_audience_health",
      {}
    )) as {
      available: boolean;
      summary: { red: number; green: number; worst: { metric: string } | null };
      metrics: Array<{ metric: string; status: string; weeks_below_target: number }>;
    };

    expect(out.available).toBe(true);
    expect(out.summary.green).toBe(1);
    expect(out.summary.red).toBe(1);
    expect(out.summary.worst?.metric).toBe("click_rate");
    expect(out.metrics).toHaveLength(2);
    expect(out.metrics.find((m) => m.metric === "click_rate")?.weeks_below_target).toBe(3);
  });
});
