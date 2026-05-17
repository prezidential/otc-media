import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/auth/session";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status"); // proposed | approved | rejected | null (all)

  const ctx = await requireWorkspace();
  if (ctx instanceof Response) return ctx;
  const { supabase, workspaceId } = ctx;

  let query = supabase
    .from("research_sources")
    .select("id,name,feed_url,site_url,status,proposed_by,trust_score,last_ingested_at,created_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ sources: data ?? [] });
}
