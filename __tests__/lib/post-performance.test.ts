import { describe, it, expect } from "vitest";
import { createMockSupabase } from "../api/helpers";
import { syncPostPerformance } from "@/lib/analytics/syncPostPerformance";
import { executeBrainstormTool } from "@/lib/brainstorm/signal-tools";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { BeehiivPostSummary } from "@/lib/integrations/beehiiv/normalize";

const SAMPLE: BeehiivPostSummary[] = [
  { id: "p1", title: "Access model", status: "published", openRate: 67, clickRate: 2.3, publishedAt: "2026-06-01T00:00:00Z" },
  { id: "p2", title: "NHI governance", status: "published", openRate: 60, clickRate: 0.4, publishedAt: "2026-05-25T00:00:00Z" },
];

describe("syncPostPerformance", () => {
  it("maps and upserts the posts, reporting the count", async () => {
    const supabase = createMockSupabase();
    const chain = supabase._setResult("post_performance", { data: null, error: null });

    const res = await syncPostPerformance(supabase as unknown as SupabaseClient, "ws-1", async () => SAMPLE);

    expect(res).toEqual({ ok: true, synced: 2 });
    expect(chain.upsert).toHaveBeenCalledTimes(1);
    const rows = chain.upsert.mock.calls[0]![0] as Array<Record<string, unknown>>;
    expect(rows[0]).toMatchObject({
      workspace_id: "ws-1",
      external_post_id: "p1",
      title: "Access model",
      open_rate: 67,
      click_rate: 2.3,
    });
  });

  it("syncs nothing (no upsert) when there are no posts", async () => {
    const supabase = createMockSupabase();
    const chain = supabase._setResult("post_performance", { data: null, error: null });
    const res = await syncPostPerformance(supabase as unknown as SupabaseClient, "ws-1", async () => []);
    expect(res).toEqual({ ok: true, synced: 0 });
    expect(chain.upsert).not.toHaveBeenCalled();
  });

  it("returns a skipped result when the fetch throws", async () => {
    const supabase = createMockSupabase();
    const res = await syncPostPerformance(supabase as unknown as SupabaseClient, "ws-1", async () => {
      throw new Error("beehiiv 401");
    });
    expect(res.ok).toBe(false);
    expect(res.skipped).toContain("beehiiv 401");
  });
});

describe("get_top_performing_themes brainstorm tool", () => {
  it("returns the cached top posts", async () => {
    const supabase = createMockSupabase();
    supabase._setResult("post_performance", {
      data: [{ external_post_id: "p1", title: "Access model", open_rate: 67, click_rate: 2.3, published_at: "2026-06-01T00:00:00Z" }],
      error: null,
    });

    const out = (await executeBrainstormTool(
      supabase as unknown as SupabaseClient,
      "ws-1",
      "get_top_performing_themes",
      { limit: 5 }
    )) as { available: boolean; top_posts: Array<{ title: string; click_rate: number }> };

    expect(out.available).toBe(true);
    expect(out.top_posts).toHaveLength(1);
    expect(out.top_posts[0]!.title).toBe("Access model");
  });

  it("reports unavailable when the cache is empty", async () => {
    const supabase = createMockSupabase();
    supabase._setResult("post_performance", { data: [], error: null });
    const out = (await executeBrainstormTool(
      supabase as unknown as SupabaseClient,
      "ws-1",
      "get_top_performing_themes",
      {}
    )) as { available: boolean };
    expect(out.available).toBe(false);
  });
});
