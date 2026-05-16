import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/auth/session";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const id = (body.leadId ?? body.id) as string | undefined;

  if (!id) return NextResponse.json({ error: "leadId or id required" }, { status: 400 });

  const ctx = await requireWorkspace();
  if (ctx instanceof Response) return ctx;
  const { supabase, workspaceId } = ctx;

  const { data, error } = await supabase
    .from("editorial_leads")
    .update({ status: "approved" })
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .select("id, status")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  return NextResponse.json({ ok: true, lead: data });
}
