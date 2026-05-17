import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/auth/session";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const name = (body.name as string)?.trim();
  const feed_url = (body.feed_url as string)?.trim();
  const site_url = (body.site_url as string)?.trim() || null;

  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
  if (!feed_url) return NextResponse.json({ error: "feed_url is required" }, { status: 400 });

  const ctx = await requireWorkspace();
  if (ctx instanceof Response) return ctx;
  const { supabase, workspaceId } = ctx;

  const { data, error } = await supabase
    .from("research_sources")
    .insert({
      workspace_id: workspaceId,
      name,
      feed_url,
      site_url,
      status: "approved",
      proposed_by: "user",
      trust_score: 1.0,
    })
    .select("id,name,feed_url,site_url,status,proposed_by,trust_score,created_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "This feed URL is already in your sources." }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, source: data }, { status: 201 });
}
