import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/auth/session";

export async function GET() {
  const ctx = await requireWorkspace();
  if (ctx instanceof Response) return ctx;
  const { supabase, workspaceId } = ctx;

  const { data, error } = await supabase
    .from("revenue_items")
    .select("id,type,title,description,priority_score,link,active,start_date,end_date")
    .eq("workspace_id", workspaceId)
    .eq("active", true)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data ?? [] });
}
