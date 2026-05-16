import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/auth/session";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const url = typeof body.url === "string" ? body.url.trim() : "";
  const publisher = typeof body.publisher === "string" ? body.publisher.trim() : "Signal inbox";

  if (!title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  const ctx = await requireWorkspace();
  if (ctx instanceof Response) return ctx;
  const { supabase, workspaceId } = ctx;

  const { data: brandProfile, error: bpErr } = await supabase
    .from("brand_profiles")
    .select("id")
    .eq("workspace_id", workspaceId)
    .limit(1)
    .maybeSingle();

  if (bpErr) return NextResponse.json({ error: bpErr.message }, { status: 500 });
  if (!brandProfile?.id) {
    return NextResponse.json({ error: "No brand profile for workspace" }, { status: 400 });
  }

  const sourcesBlock = url
    ? `\n\nSources:\n${url}`
    : "\n\nSources:\n(no URL — add sources on the Leads page if needed)";
  const contrarian_take = `Promoted from signal inbox.\n\n${title}${sourcesBlock}`;

  const { data: inserted, error: insErr } = await supabase
    .from("editorial_leads")
    .insert({
      workspace_id: workspaceId,
      cluster_id: null,
      brand_profile_id: brandProfile.id,
      angle: title.slice(0, 500),
      why_now: "Pulled forward from the latest signals list.",
      who_it_impacts: publisher.slice(0, 400),
      contrarian_take,
      confidence_score: 0.5,
      status: "pending_review",
    })
    .select("id")
    .single();

  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, leadId: inserted?.id });
}
