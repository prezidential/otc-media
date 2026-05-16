import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/auth/session";

export async function GET() {
  const ctx = await requireWorkspace();
  if (ctx instanceof Response) return ctx;
  const { supabase, workspaceId } = ctx;

  const { data, error } = await supabase
    .from("issue_drafts")
    .select("id,content,content_json,created_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: "issue_drafts query failed.", detail: error.message },
      { status: 503 }
    );
  }

  if (!data) {
    return NextResponse.json(
      {
        error: "No draft found. Generate an issue draft first.",
      },
      { status: 404 }
    );
  }

  const response: Record<string, unknown> = {
    id: data.id,
    draft: data.content ?? "",
    created_at: data.created_at,
  };
  if (data.content_json != null) {
    try {
      response.content_json =
        typeof data.content_json === "object" && data.content_json !== null
          ? JSON.parse(JSON.stringify(data.content_json))
          : data.content_json;
    } catch {
      response.content_json = null;
    }
  }
  return NextResponse.json(response);
}
