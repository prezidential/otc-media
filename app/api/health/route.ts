import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Readiness probe.
 *
 * Verifies the two pieces of platform configuration the app cannot run without:
 *   - Required Supabase env vars are present.
 *   - Supabase is reachable using the service-role key (trivial query against
 *     `workspaces`, which always exists post-`schema-tenancy.sql`).
 *
 * Multi-tenancy note: this endpoint deliberately does NOT check `WORKSPACE_ID`.
 * That env var was removed in Phase 2A M2 — workspaces are now resolved per
 * request via `requireWorkspace()` from the user's session. Health checks have
 * no user, so per-workspace state isn't a meaningful liveness signal here.
 */
export async function GET() {
  const hasUrl = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL?.trim());
  const hasSecret = Boolean(process.env.SUPABASE_SECRET_KEY?.trim());
  const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY?.trim());

  let supabaseStatus: "ok" | "error" | "skipped" = "skipped";
  let supabaseError: string | undefined;

  if (hasUrl && hasSecret) {
    try {
      const admin = supabaseAdmin();
      const { error } = await admin
        .from("workspaces")
        .select("id", { count: "exact", head: true })
        .limit(1);
      if (error) {
        supabaseStatus = "error";
        supabaseError = error.message;
      } else {
        supabaseStatus = "ok";
      }
    } catch (err) {
      supabaseStatus = "error";
      supabaseError = err instanceof Error ? err.message : String(err);
    }
  }

  const checks = {
    supabase_url: hasUrl,
    supabase_secret: hasSecret,
    supabase_reachable: supabaseStatus === "ok",
    anthropic_api_key: hasAnthropic,
  };

  const ok = hasUrl && hasSecret && supabaseStatus === "ok";

  return NextResponse.json(
    {
      ok,
      service: "otc-media",
      supabase: supabaseStatus,
      ...(supabaseError ? { supabase_error: supabaseError } : {}),
      checks,
      timestamp: new Date().toISOString(),
    },
    { status: ok ? 200 : 503 }
  );
}
