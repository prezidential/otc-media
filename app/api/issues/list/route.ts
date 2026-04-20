import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/auth/session";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const limit = Number(searchParams.get("limit") || "10");

  const ctx = await requireWorkspace();
  if (ctx instanceof Response) return ctx;
  const { supabase, workspaceId } = ctx;

  const { data, error } = await supabase
    .from("issue_drafts")
    .select("id,content,content_json,brand_profile_id,status,created_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ drafts: data ?? [] });
}
