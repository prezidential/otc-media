import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function GET() {
  const workspaceId = process.env.WORKSPACE_ID!;
  const supabase = supabaseAdmin();

  const { data, error } = await supabase
    .from("content_outlines")
    .select("id,name,kind,is_default,created_at")
    .eq("workspace_id", workspaceId)
    .order("kind", { ascending: true })
    .order("name", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ contentOutlines: data ?? [] });
}
