import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/auth/session";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Load a single issue draft by id (workspace-scoped). Backs the Issues page
 * `?draft=<id>` deep link used by the brainstorm → issues handoff (§3.19 P1b).
 */
export async function GET(_req: Request, routeCtx: Ctx) {
  const { id } = await routeCtx.params;
  if (!id) return NextResponse.json({ error: "draft id required" }, { status: 400 });

  const ctx = await requireWorkspace();
  if (ctx instanceof Response) return ctx;
  const { supabase, workspaceId } = ctx;

  const { data, error } = await supabase
    .from("issue_drafts")
    .select("id,content,content_json,created_at,status")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: "issue_drafts query failed.", detail: error.message },
      { status: 503 }
    );
  }
  if (!data) {
    return NextResponse.json({ error: "Draft not found." }, { status: 404 });
  }

  const response: Record<string, unknown> = {
    id: data.id,
    draft: data.content ?? "",
    created_at: data.created_at,
    status: data.status ?? null,
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
