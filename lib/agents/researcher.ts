import { supabaseAdmin } from "@/lib/supabase/server";
import { type AgentDefinition, type AgentTool } from "./framework";

function createResearcherTools(workspaceId: string): AgentTool[] {
  return [
    {
      name: "check_signal_freshness",
      description:
        "Check how fresh signals are per approved source. Returns each source with its last ingest date and whether it is stale (>24h).",
      execute: async () => {
        const supabase = supabaseAdmin();

        const { data: sources } = await supabase
          .from("research_sources")
          .select("id, name, feed_url, last_ingested_at")
          .eq("workspace_id", workspaceId)
          .eq("status", "approved");

        if (!sources || sources.length === 0) {
          return {
            sources: [],
            message:
              "No approved sources found. Ask the user to add sources on the Research Setup tab.",
          };
        }

        const results = sources.map((s) => {
          const hoursAgo = s.last_ingested_at
            ? (Date.now() - new Date(s.last_ingested_at).getTime()) / (1000 * 60 * 60)
            : Infinity;
          const isStale = hoursAgo > 24;
          return {
            id: s.id,
            name: s.name,
            feed_url: s.feed_url,
            last_ingested_at: s.last_ingested_at ?? null,
            hours_since_last: Math.round(hoursAgo),
            is_stale: isStale,
          };
        });

        const staleCount = results.filter((r) => r.is_stale).length;
        return { sources: results, total: results.length, stale: staleCount };
      },
    },
    {
      name: "ingest_approved_sources",
      description:
        "Ingest RSS feeds from all approved research sources (or a specific source by ID). Returns inserted and skipped counts.",
      execute: async (params) => {
        const sourceIdFilter = params.source_id as string | undefined;

        const supabase = supabaseAdmin();
        const Parser = (await import("rss-parser")).default;
        const crypto = await import("crypto");
        const parser = new Parser();

        let query = supabase
          .from("research_sources")
          .select("id, name, feed_url, trust_score")
          .eq("workspace_id", workspaceId)
          .eq("status", "approved");

        if (sourceIdFilter) query = query.eq("id", sourceIdFilter);

        const { data: sources } = await query;
        if (!sources || sources.length === 0) {
          return { error: "No approved sources to ingest" };
        }

        let totalInserted = 0;
        let totalSkipped = 0;
        const sourceResults: { name: string; inserted: number; skipped: number }[] = [];

        for (const source of sources) {
          let inserted = 0;
          let skipped = 0;

          try {
            const feed = await parser.parseURL(source.feed_url);
            const publisher = feed.title || source.name;

            const { data: existingSource } = await supabase
              .from("sources")
              .select("id")
              .eq("workspace_id", workspaceId)
              .eq("type", "rss")
              .eq("base_url", source.feed_url)
              .maybeSingle();

            let legacySourceId = existingSource?.id;
            if (!legacySourceId) {
              const { data: created } = await supabase
                .from("sources")
                .insert({
                  workspace_id: workspaceId,
                  name: publisher,
                  type: "rss",
                  base_url: source.feed_url,
                  trust_score: source.trust_score,
                })
                .select("id")
                .single();
              legacySourceId = created?.id;
            }

            const items = (feed.items ?? []).slice(0, 15);
            for (const item of items) {
              const url = item.link?.trim();
              const title = item.title?.trim();
              if (!url || !title) { skipped++; continue; }

              const dh = crypto
                .createHash("sha256")
                .update(`${url}|${title}|${publisher}`)
                .digest("hex");
              const publishedAt = item.isoDate ? new Date(item.isoDate).toISOString() : null;

              const { error } = await supabase.from("signals").insert({
                workspace_id: workspaceId,
                source_id: legacySourceId,
                url,
                title,
                publisher,
                published_at: publishedAt,
                raw_text: item.contentSnippet || item.content || null,
                normalized_summary: item.contentSnippet || null,
                relevance_score: 0.0,
                trust_score: source.trust_score,
                dedupe_hash: dh,
              });

              if (error) skipped++;
              else inserted++;
            }

            await supabase
              .from("research_sources")
              .update({ last_ingested_at: new Date().toISOString() })
              .eq("id", source.id);
          } catch {
            skipped++;
          }

          totalInserted += inserted;
          totalSkipped += skipped;
          sourceResults.push({ name: source.name, inserted, skipped });
        }

        return {
          sources_processed: sourceResults.length,
          total_inserted: totalInserted,
          total_skipped: totalSkipped,
          breakdown: sourceResults,
        };
      },
    },
    {
      name: "report_summary",
      description:
        "Generate a summary of research activity. Provide total_inserted and total_skipped from your ingest runs.",
      execute: async (params) => {
        return {
          summary: `Research complete. Inserted ${params.total_inserted ?? 0} new signals, skipped ${params.total_skipped ?? 0} duplicates.`,
          total_inserted: params.total_inserted ?? 0,
          total_skipped: params.total_skipped ?? 0,
        };
      },
    },
  ];
}

export function createResearcherAgent(workspaceId: string): AgentDefinition {
  return {
    id: "researcher",
    name: "Researcher Agent",
    role: "research",
    systemPrompt: `You are the Researcher Agent in a newsroom. Your job is to keep the signal database fresh by ingesting content from approved research sources.

Your workflow:
1. Call check_signal_freshness to see which approved sources have stale signals (>24h since last ingest).
2. If stale sources exist, call ingest_approved_sources to pull fresh content from all of them.
3. If no sources are approved yet, report that and stop — do not fabricate sources.
4. After ingesting, call report_summary with the total counts.
5. Signal done with a brief summary of what you did.

Be efficient. Only ingest when sources are stale. Never invent content.`,
    tools: createResearcherTools(workspaceId),
    maxIterations: 15,
  };
}
