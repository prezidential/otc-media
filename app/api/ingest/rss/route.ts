import { NextResponse } from "next/server";
import Parser from "rss-parser";
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabase/server";

const parser = new Parser();

function dedupeHash(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export async function POST(req: Request) {
  const { feedUrl, sourceName, limit = 15 } = await req.json();
  if (!feedUrl) return NextResponse.json({ error: "feedUrl required" }, { status: 400 });

  const workspaceId = process.env.WORKSPACE_ID!;
  const supabase = supabaseAdmin();

  const feed = await parser.parseURL(feedUrl);
  const publisher = sourceName || feed.title || "Unknown RSS";

  // upsert source
  const { data: existingSource } = await supabase
    .from("sources")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("type", "rss")
    .eq("base_url", feedUrl)
    .maybeSingle();

  let sourceId = existingSource?.id;

  if (!sourceId) {
    const { data: created, error } = await supabase
      .from("sources")
      .insert({
        workspace_id: workspaceId,
        name: publisher,
        type: "rss",
        base_url: feedUrl,
        trust_score: 0.7
      })
      .select("id")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    sourceId = created.id;
  }

  let inserted = 0;
  let skipped = 0;

  const items = (feed.items || []).slice(0, limit);

  for (const item of items) {
    const url = item.link?.trim();
    const title = item.title?.trim();
    if (!url || !title) { skipped++; continue; }

    const dh = dedupeHash(`${url}|${title}|${publisher}`);
    const publishedAt = item.isoDate ? new Date(item.isoDate).toISOString() : null;

    const { error } = await supabase.from("signals").insert({
      workspace_id: workspaceId,
      source_id: sourceId,
      url,
      title,
      publisher,
      published_at: publishedAt,
      raw_text: item.contentSnippet || item.content || null,
      normalized_summary: item.contentSnippet || null,
      relevance_score: 0.0,
      trust_score: 0.7,
      dedupe_hash: dh
    });

    if (error) skipped++;
    else inserted++;
  }

  return NextResponse.json({ feedUrl, publisher, inserted, skipped });
}
