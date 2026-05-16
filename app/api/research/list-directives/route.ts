import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/auth/session";

export async function GET() {
  const ctx = await requireWorkspace();
  if (ctx instanceof Response) return ctx;
  const { supabase, workspaceId } = ctx;

  const { data, error } = await supabase
    .from("research_directives")
    .select("id,name,description,cadence,active")
    .eq("workspace_id", workspaceId)
    .order("name", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ directives: data ?? [] });
}
