import type { SupabaseClient } from "@supabase/supabase-js";
import type { BeehiivPostSummary } from "@/lib/integrations/beehiiv/normalize";

export type SyncPostPerformanceResult = { ok: boolean; synced: number; skipped?: string };

/**
 * Upsert a batch of recent posts into the `post_performance` cache (§3.19 P1c).
 * Pure over its inputs: the caller injects `fetchPosts` (the live integration
 * call) and a `supabase` client (service-role from the route), which keeps this
 * unit-testable and decoupled from OAuth/registry wiring.
 */
export async function syncPostPerformance(
  supabase: SupabaseClient,
  workspaceId: string,
  fetchPosts: () => Promise<BeehiivPostSummary[]>
): Promise<SyncPostPerformanceResult> {
  let posts: BeehiivPostSummary[];
  try {
    posts = await fetchPosts();
  } catch (e) {
    return { ok: false, synced: 0, skipped: e instanceof Error ? e.message : String(e) };
  }

  const rows = posts
    .filter((p) => typeof p.id === "string" && p.id.length > 0)
    .map((p) => ({
      workspace_id: workspaceId,
      external_post_id: p.id,
      title: p.title || "Untitled",
      status: p.status ?? null,
      open_rate: Number.isFinite(p.openRate) ? p.openRate : null,
      click_rate: Number.isFinite(p.clickRate) ? p.clickRate : null,
      published_at: p.publishedAt ?? null,
      fetched_at: new Date().toISOString(),
    }));

  if (rows.length === 0) return { ok: true, synced: 0 };

  const { error } = await supabase
    .from("post_performance")
    .upsert(rows, { onConflict: "workspace_id,external_post_id" });
  if (error) return { ok: false, synced: 0, skipped: error.message };
  return { ok: true, synced: rows.length };
}
