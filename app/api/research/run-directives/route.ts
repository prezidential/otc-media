import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { runCadenceIngest } from "@/lib/research/runCadenceIngest";

type Cadence = "daily" | "weekly";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const cadence = body.cadence as Cadence | undefined;
  const limitPerFeed = Number(body.limitPerFeed) || 15;

  if (!cadence || (cadence !== "daily" && cadence !== "weekly")) {
    return NextResponse.json({ error: "cadence required: 'daily' | 'weekly'" }, { status: 400 });
  }

  const workspaceId = process.env.WORKSPACE_ID!;
  const supabase = supabaseAdmin();

  const result = await runCadenceIngest(supabase, workspaceId, cadence, limitPerFeed, {
    source: "api_research_run_directives",
  });

  if (!result.run_id && !result.ok) {
    return NextResponse.json({ error: result.error ?? "Failed to start ingest" }, { status: 500 });
  }

  if (!result.ok) {
    return NextResponse.json({
      ok: false,
      inserted: result.inserted,
      skipped: result.skipped,
      details: result.details,
      error: result.error,
    });
  }

  return NextResponse.json({
    ok: true,
    inserted: result.inserted,
    skipped: result.skipped,
    details: result.details,
  });
}
