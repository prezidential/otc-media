import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const limit = Number(searchParams.get("limit") || "25");

  const workspaceId = process.env.WORKSPACE_ID!;
  const supabase = supabaseAdmin();

  const { data, error } = await supabase
    .from("signals")
    .select("title,publisher,url,published_at,captured_at")
    .eq("workspace_id", workspaceId)
    .order("captured_at", { ascending: false })
    .limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ signals: data || [] });
}