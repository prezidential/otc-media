import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getRegisteredPlugins } from "@/lib/integrations/registry";
import { syncPostPerformance } from "@/lib/analytics/syncPostPerformance";
import type { BeehiivPostSummary } from "@/lib/integrations/beehiiv/normalize";

// Side-effect: registers the Beehiiv plugin.
import "@/lib/integrations/beehiiv";

/**
 * Refresh the post_performance cache (§3.19 P1c). Fetches recent published posts
 * (with open/click rates) from the live Beehiiv integration using the caller's
 * per-workspace OAuth token, and upserts them via the service-role client.
 * Fire-and-forget friendly: returns a small summary and never throws upstream.
 */
export async function POST(req: Request) {
  const ctx = await requireWorkspace();
  if (ctx instanceof Response) return ctx;

  const beehiiv = getRegisteredPlugins().find((p) => p.id === "beehiiv");
  if (!beehiiv || !beehiiv.isEnabled()) {
    return NextResponse.json({ ok: false, synced: 0, skipped: "Beehiiv integration not enabled" });
  }

  const toolCtx = {
    workspaceId: ctx.workspaceId,
    userId: ctx.userId,
    supabase: ctx.supabase,
    origin: new URL(req.url).origin,
  };

  const result = await syncPostPerformance(supabaseAdmin(), ctx.workspaceId, async () => {
    const res = await beehiiv.callTool("list_posts", { limit: 20, status: "published" }, toolCtx);
    return (res as { posts?: BeehiivPostSummary[] }).posts ?? [];
  });

  return NextResponse.json(result);
}
