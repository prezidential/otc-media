import { NextResponse } from "next/server";
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabase/server";

function dedupeHash(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const title = (body.title as string)?.trim();
  const url = (body.url as string)?.trim() || null;
  const publisher = (body.publisher as string)?.trim() || "Manual Entry";
  const notes = (body.notes as string)?.trim() || null;

  if (!title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  const workspaceId = process.env.WORKSPACE_ID!;
  const supabase = supabaseAdmin();

  const dh = dedupeHash(`manual|${title}|${publisher}`);

  const { data, error } = await supabase
    .from("signals")
    .insert({
      workspace_id: workspaceId,
      source_id: null,
      url: url || `manual://${dh.slice(0, 12)}`,
      title,
      publisher,
      published_at: new Date().toISOString(),
      raw_text: notes,
      normalized_summary: notes,
      relevance_score: 0.5,
      trust_score: 1.0,
      dedupe_hash: dh,
    })
    .select("title,publisher,url")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, signal: data });
}
