import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/auth/session";

export async function GET() {
  const ctx = await requireWorkspace();
  if (ctx instanceof Response) return ctx;
  const { supabase, workspaceId } = ctx;

  const { data, error } = await supabase
    .from("research_intent")
    .select("id,topic_focus,watch_entities,keywords,updated_at")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    intent: data ?? { topic_focus: [], watch_entities: [], keywords: [] },
  });
}

export async function PUT(req: Request) {
  const body = await req.json().catch(() => ({}));

  const topic_focus = Array.isArray(body.topic_focus)
    ? (body.topic_focus as unknown[]).filter((v) => typeof v === "string")
    : [];
  const watch_entities = Array.isArray(body.watch_entities)
    ? (body.watch_entities as unknown[]).filter((v) => typeof v === "string")
    : [];
  const keywords = Array.isArray(body.keywords)
    ? (body.keywords as unknown[]).filter((v) => typeof v === "string")
    : [];

  const ctx = await requireWorkspace();
  if (ctx instanceof Response) return ctx;
  const { supabase, workspaceId } = ctx;

  const { data, error } = await supabase
    .from("research_intent")
    .upsert(
      { workspace_id: workspaceId, topic_focus, watch_entities, keywords, updated_at: new Date().toISOString() },
      { onConflict: "workspace_id" }
    )
    .select("id,topic_focus,watch_entities,keywords,updated_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, intent: data });
}
