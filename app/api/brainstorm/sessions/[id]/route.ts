import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/auth/session";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, routeCtx: Ctx) {
  const { id: sessionId } = await routeCtx.params;

  const ctx = await requireWorkspace();
  if (ctx instanceof Response) return ctx;
  const { supabase, workspaceId } = ctx;

  const { data, error } = await supabase
    .from("brainstorm_sessions")
    .select("id,title,brand_profile_id,artifact_json,created_at,updated_at")
    .eq("workspace_id", workspaceId)
    .eq("id", sessionId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  return NextResponse.json({ session: data });
}
