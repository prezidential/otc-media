import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/auth/session";
import { promoteBrainstormSessionToIssueDraft } from "@/lib/brainstorm/promote-to-issue";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, routeCtx: Ctx) {
  const { id: sessionId } = await routeCtx.params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const brandOverride = typeof body.brandProfileId === "string" ? body.brandProfileId.trim() : "";

  const ctx = await requireWorkspace();
  if (ctx instanceof Response) return ctx;
  const { supabase, workspaceId } = ctx;

  const { data: session, error: sErr } = await supabase
    .from("brainstorm_sessions")
    .select("id,brand_profile_id,artifact_json")
    .eq("workspace_id", workspaceId)
    .eq("id", sessionId)
    .maybeSingle();

  if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 });
  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  const brandProfileId = brandOverride || (session.brand_profile_id as string | null);
  if (!brandProfileId) {
    return NextResponse.json(
      { error: "brandProfileId is required (session has none); pass brandProfileId in the JSON body." },
      { status: 400 }
    );
  }

  const { data: bp, error: bpErr } = await supabase
    .from("brand_profiles")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("id", brandProfileId)
    .maybeSingle();
  if (bpErr) return NextResponse.json({ error: bpErr.message }, { status: 500 });
  if (!bp) return NextResponse.json({ error: "Brand profile not found" }, { status: 404 });

  const artifactJson =
    session.artifact_json && typeof session.artifact_json === "object" && !Array.isArray(session.artifact_json)
      ? (session.artifact_json as Record<string, unknown>)
      : {};

  try {
    const { draftId } = await promoteBrainstormSessionToIssueDraft({
      supabase,
      workspaceId,
      sessionId,
      artifactJson,
      brandProfileId,
    });
    return NextResponse.json({ ok: true, draftId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
