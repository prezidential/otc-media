import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function GET() {
  const workspaceId = process.env.WORKSPACE_ID?.trim();
  if (!workspaceId) {
    return NextResponse.json({ error: "WORKSPACE_ID not configured" }, { status: 500 });
  }

  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from("brainstorm_sessions")
    .select("id,title,brand_profile_id,created_at,updated_at")
    .eq("workspace_id", workspaceId)
    .order("updated_at", { ascending: false })
    .limit(80);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ sessions: data ?? [] });
}

export async function POST(req: Request) {
  const workspaceId = process.env.WORKSPACE_ID?.trim();
  if (!workspaceId) {
    return NextResponse.json({ error: "WORKSPACE_ID not configured" }, { status: 500 });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const title = typeof body.title === "string" && body.title.trim() ? body.title.trim().slice(0, 200) : "Brainstorm";
  const brandProfileId = typeof body.brandProfileId === "string" ? body.brandProfileId : null;

  const supabase = supabaseAdmin();

  if (brandProfileId) {
    const { data: bp, error: bpErr } = await supabase
      .from("brand_profiles")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("id", brandProfileId)
      .maybeSingle();
    if (bpErr) return NextResponse.json({ error: bpErr.message }, { status: 500 });
    if (!bp) return NextResponse.json({ error: "Brand profile not found" }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("brainstorm_sessions")
    .insert({
      workspace_id: workspaceId,
      title,
      brand_profile_id: brandProfileId,
    })
    .select("id,title,brand_profile_id,created_at,updated_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ session: data });
}
