import { NextResponse } from "next/server";
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabase/server";

type Ctx = { params: Promise<{ id: string }> };

function dedupeHash(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export async function POST(_req: Request, ctx: Ctx) {
  const workspaceId = process.env.WORKSPACE_ID?.trim();
  if (!workspaceId) {
    return NextResponse.json({ error: "WORKSPACE_ID not configured" }, { status: 500 });
  }

  const { id: sessionId } = await ctx.params;
  const supabase = supabaseAdmin();

  const { data: session, error: sErr } = await supabase
    .from("brainstorm_sessions")
    .select("id,artifact_json")
    .eq("workspace_id", workspaceId)
    .eq("id", sessionId)
    .maybeSingle();

  if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 });
  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  const artifact =
    session.artifact_json && typeof session.artifact_json === "object" && !Array.isArray(session.artifact_json)
      ? (session.artifact_json as Record<string, unknown>)
      : {};
  const pending = artifact.pending_manual_signal;
  if (!pending || typeof pending !== "object") {
    return NextResponse.json({ error: "No pending manual signal on this session" }, { status: 400 });
  }
  const p = pending as Record<string, unknown>;
  const title = typeof p.title === "string" ? p.title.trim() : "";
  if (!title) {
    return NextResponse.json({ error: "Pending signal is missing a title" }, { status: 400 });
  }
  const url = typeof p.url === "string" ? p.url.trim() : "";
  const notes = typeof p.notes === "string" ? p.notes.trim() : "";

  const dh = dedupeHash(`manual|${title}|Manual Entry`);

  const { data: sig, error: insErr } = await supabase
    .from("signals")
    .insert({
      workspace_id: workspaceId,
      source_id: null,
      url: url || `manual://${dh.slice(0, 12)}`,
      title,
      publisher: "Manual Entry",
      published_at: new Date().toISOString(),
      raw_text: notes || null,
      normalized_summary: notes || null,
      relevance_score: 0.5,
      trust_score: 1.0,
      dedupe_hash: dh,
    })
    .select("id,title,url")
    .single();

  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  const nextArtifact = { ...artifact, pending_manual_signal: null };
  const { error: upErr } = await supabase
    .from("brainstorm_sessions")
    .update({ artifact_json: nextArtifact, updated_at: new Date().toISOString() })
    .eq("id", sessionId)
    .eq("workspace_id", workspaceId);

  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, signal: sig });
}
