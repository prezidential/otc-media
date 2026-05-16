import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/auth/session";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, routeCtx: Ctx) {
  const { id } = await routeCtx.params;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const ctx = await requireWorkspace();
  if (ctx instanceof Response) return ctx;
  const { supabase, workspaceId } = ctx;

  const { data, error } = await supabase
    .from("signals")
    .select("id,title,url,publisher,published_at,captured_at,normalized_summary,directive_id")
    .eq("workspace_id", workspaceId)
    .eq("id", id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ signal: data });
}
