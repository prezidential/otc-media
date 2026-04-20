import type { SupabaseClient } from "@supabase/supabase-js";
import Parser from "rss-parser";
import crypto from "crypto";
import { RSS_FEED_MAP } from "@/lib/research/rssFeedMap";

const parser = new Parser();

function dedupeHash(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export type CadenceIngestDetail = {
  directive: string;
  feedUrl: string;
  inserted: number;
  skipped: number;
};

export type CadenceIngestResult = {
  ok: boolean;
  inserted: number;
  skipped: number;
  details: CadenceIngestDetail[];
  error?: string;
  run_id: string;
};

/**
 * Directive-scoped RSS ingest (same behavior as POST /api/research/run-directives).
 * Used by the Brainstormer `trigger_signal_ingest` tool and the HTTP route.
 */
export async function runCadenceIngest(
  supabase: SupabaseClient,
  workspaceId: string,
  cadence: "daily" | "weekly",
  limitPerFeed: number,
  meta: Record<string, unknown> = {}
): Promise<CadenceIngestResult> {
  const { data: runRow, error: runInsertError } = await supabase
    .from("runs")
    .insert({
      workspace_id: workspaceId,
      run_type: "directive_ingest",
      status: "initiated",
      input_refs_json: { cadence, limitPerFeed, ...meta },
      output_refs_json: {},
    })
    .select("id")
    .single();

  if (runInsertError || !runRow?.id) {
    return {
      ok: false,
      inserted: 0,
      skipped: 0,
      details: [],
      error: runInsertError?.message ?? "Failed to create run",
      run_id: "",
    };
  }

  const runId = runRow.id as string;
  let totalInserted = 0;
  let totalSkipped = 0;
  const details: CadenceIngestDetail[] = [];

  try {
    const { data: directives, error: dirError } = await supabase
      .from("research_directives")
      .select("id, name")
      .eq("workspace_id", workspaceId)
      .eq("cadence", cadence);

    if (dirError) throw new Error(dirError.message);

    const activeDirectives = directives ?? [];

    for (const directive of activeDirectives) {
      const feedUrls = RSS_FEED_MAP[directive.name] ?? [];
      for (const feedUrl of feedUrls) {
        let inserted = 0;
        let skipped = 0;
        try {
          const feed = await parser.parseURL(feedUrl);
          const publisher = feed.title ?? "Unknown RSS";

          const { data: existingSource } = await supabase
            .from("sources")
            .select("id")
            .eq("workspace_id", workspaceId)
            .eq("type", "rss")
            .eq("base_url", feedUrl)
            .maybeSingle();

          let sourceId = existingSource?.id;
          if (!sourceId) {
            const { data: created, error: srcErr } = await supabase
              .from("sources")
              .insert({
                workspace_id: workspaceId,
                name: publisher,
                type: "rss",
                base_url: feedUrl,
                trust_score: 0.7,
              })
              .select("id")
              .single();
            if (srcErr) throw new Error(srcErr.message);
            sourceId = created!.id;
          }

          const items = (feed.items || []).slice(0, limitPerFeed);
          const tagsJson = [directive.name];

          for (const item of items) {
            const url = item.link?.trim();
            const title = item.title?.trim();
            if (!url || !title) {
              skipped++;
              continue;
            }
            const dh = dedupeHash(`${url}|${title}|${publisher}`);
            const publishedAt = item.isoDate ? new Date(item.isoDate).toISOString() : null;

            const { error: sigErr } = await supabase.from("signals").insert({
              workspace_id: workspaceId,
              source_id: sourceId,
              directive_id: directive.id,
              url,
              title,
              publisher,
              published_at: publishedAt,
              raw_text: item.contentSnippet || item.content || null,
              normalized_summary: item.contentSnippet || null,
              relevance_score: 0.0,
              trust_score: 0.7,
              dedupe_hash: dh,
              tags_json: tagsJson,
            });
            if (sigErr) skipped++;
            else inserted++;
          }

          totalInserted += inserted;
          totalSkipped += skipped;
          details.push({ directive: directive.name, feedUrl, inserted, skipped });
        } catch (feedErr) {
          const msg = feedErr instanceof Error ? feedErr.message : String(feedErr);
          await supabase
            .from("runs")
            .update({ status: "failed", error_message: msg, finished_at: new Date().toISOString() })
            .eq("id", runId);
          return {
            ok: false,
            inserted: totalInserted,
            skipped: totalSkipped,
            details,
            error: msg,
            run_id: runId,
          };
        }
      }
    }

    await supabase
      .from("runs")
      .update({
        status: "completed",
        output_refs_json: { inserted: totalInserted, skipped: totalSkipped, details },
        finished_at: new Date().toISOString(),
      })
      .eq("id", runId);

    return {
      ok: true,
      inserted: totalInserted,
      skipped: totalSkipped,
      details,
      run_id: runId,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await supabase
      .from("runs")
      .update({ status: "failed", error_message: msg, finished_at: new Date().toISOString() })
      .eq("id", runId);
    return {
      ok: false,
      inserted: totalInserted,
      skipped: totalSkipped,
      details,
      error: msg,
      run_id: runId,
    };
  }
}
