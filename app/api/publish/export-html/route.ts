import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { renderDraftHtml } from "@/lib/publish/renderHtml";
import type { DraftContentJson } from "@/lib/draft/content";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const draftId = (body.draftId ?? body.id) as string | undefined;

  if (!draftId) {
    return NextResponse.json({ error: "draftId required" }, { status: 400 });
  }

  const workspaceId = process.env.WORKSPACE_ID!;
  const supabase = supabaseAdmin();

  const { data: draft, error } = await supabase
    .from("issue_drafts")
    .select("id, content_json")
    .eq("id", draftId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!draft) return NextResponse.json({ error: "Draft not found" }, { status: 404 });

  const contentJson = draft.content_json as DraftContentJson | null;
  if (!contentJson) {
    return NextResponse.json({ error: "Draft has no structured content" }, { status: 400 });
  }

  const html = renderDraftHtml(contentJson);
  const title = contentJson.title || "Untitled Issue";

  return NextResponse.json({ ok: true, title, html });
}
