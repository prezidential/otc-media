import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const id = (body.leadId ?? body.id) as string | undefined;

  if (!id) return NextResponse.json({ error: "leadId or id required" }, { status: 400 });

  const workspaceId = process.env.WORKSPACE_ID!;
  const supabase = supabaseAdmin();

  const { data, error } = await supabase
    .from("editorial_leads")
    .update({ status: "dismissed" })
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .select("id, status")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  return NextResponse.json({ ok: true, lead: data });
}
