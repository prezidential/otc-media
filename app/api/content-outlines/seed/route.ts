import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { DEFAULT_INSIDER_OUTLINE, DEFAULT_NEWSLETTER_OUTLINE } from "@/lib/content-outlines/default-specs";

export async function POST() {
  const workspaceId = process.env.WORKSPACE_ID!;
  const supabase = supabaseAdmin();

  const { data: existing, error: fetchError } = await supabase
    .from("content_outlines")
    .select("id")
    .eq("workspace_id", workspaceId)
    .limit(1);

  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
  if (existing && existing.length > 0) {
    return NextResponse.json({
      inserted: 0,
      message: "Content outlines already exist for workspace",
      outlines: [] as { id: string; kind: string; name: string }[],
    });
  }

  const { data: insertedRows, error: insertError } = await supabase
    .from("content_outlines")
    .insert([
      {
        workspace_id: workspaceId,
        name: "Default newsletter issue",
        kind: "newsletter_issue",
        spec_json: DEFAULT_NEWSLETTER_OUTLINE,
        is_default: true,
      },
      {
        workspace_id: workspaceId,
        name: "Default Insider Access",
        kind: "insider_access",
        spec_json: DEFAULT_INSIDER_OUTLINE,
        is_default: true,
      },
    ])
    .select("id,kind,name");

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
  return NextResponse.json({
    inserted: insertedRows?.length ?? 0,
    outlines: insertedRows ?? [],
  });
}
