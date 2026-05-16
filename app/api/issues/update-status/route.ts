import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/auth/session";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const id = (body.draftId ?? body.id) as string | undefined;
  const status = body.status as string | undefined;

  if (!id) return NextResponse.json({ error: "draftId required" }, { status: 400 });
  if (!status || !["draft", "reviewed", "published"].includes(status)) {
    return NextResponse.json({ error: "status must be draft, reviewed, or published" }, { status: 400 });
  }

  const ctx = await requireWorkspace();
  if (ctx instanceof Response) return ctx;
  const { supabase, workspaceId } = ctx;

  const { error } = await supabase
    .from("issue_drafts")
    .update({ status })
    .eq("id", id)
    .eq("workspace_id", workspaceId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id, status });
}
