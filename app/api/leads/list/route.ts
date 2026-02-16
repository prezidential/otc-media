import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const limit = Number(searchParams.get("limit") || "50");
  const status = searchParams.get("status") ?? undefined;

  const workspaceId = process.env.WORKSPACE_ID!;
  const supabase = supabaseAdmin();

  let query = supabase
    .from("editorial_leads")
    .select("id,angle,why_now,who_it_impacts,contrarian_take,confidence_score,status,created_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status) query = query.eq("status", status);

  const { data, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ leads: data ?? [] });
}
