import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const limit = Number(searchParams.get("limit") || "25");

  const workspaceId = process.env.WORKSPACE_ID!;
  const supabase = supabaseAdmin();

  const { data, error } = await supabase
    .from("runs")
    .select("run_type,status,started_at,finished_at,error_message,output_refs_json")
    .eq("workspace_id", workspaceId)
    .order("started_at", { ascending: false })
    .limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ runs: data ?? [] });
}
