import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const workspaceId = process.env.WORKSPACE_ID?.trim();
  if (!workspaceId) {
    return NextResponse.json({ error: "WORKSPACE_ID not configured" }, { status: 500 });
  }

  const { id: sessionId } = await ctx.params;
  const supabase = supabaseAdmin();

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
