import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function GET() {
  const workspaceId = process.env.WORKSPACE_ID!;
  const supabase = supabaseAdmin();

  const { data, error } = await supabase
    .from("issue_drafts")
    .select("id,content,created_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: "issue_drafts table is not available or query failed. Run a generate first or create the table." },
      { status: 503 }
    );
  }

  if (!data) {
    return NextResponse.json(
      { error: "No draft found. Generate an issue draft first." },
      { status: 404 }
    );
  }

  return NextResponse.json({
    id: data.id,
    draft: data.content ?? "",
    created_at: data.created_at,
  });
}
