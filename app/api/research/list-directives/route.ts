import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function GET() {
  const workspaceId = process.env.WORKSPACE_ID!;
  const supabase = supabaseAdmin();

  const { data, error } = await supabase
    .from("research_directives")
    .select("id,name,description,cadence,active")
    .eq("workspace_id", workspaceId)
    .order("name", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ directives: data ?? [] });
}
