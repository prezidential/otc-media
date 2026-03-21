import { supabaseAdmin } from "@/lib/supabase/server";
import { RSS_FEED_MAP } from "@/lib/research/rssFeedMap";
import { type AgentDefinition, type AgentTool } from "./framework";

function createResearcherTools(workspaceId: string): AgentTool[] {
  return [
    {
      name: "check_signal_freshness",
      description: "Check how fresh signals are per directive. Returns each directive with its last signal date and whether it is stale (>24h for daily, >7d for weekly).",
      execute: async () => {
        const supabase = supabaseAdmin();
        const { data: directives } = await supabase
          .from("research_directives")
          .select("id, name, cadence")
          .eq("workspace_id", workspaceId);

        if (!directives || directives.length === 0) return { directives: [], message: "No directives found" };

        const results = [];
        for (const d of directives) {
          const { data: latest } = await supabase
            .from("signals")
            .select("captured_at")
            .eq("workspace_id", workspaceId)
            .eq("directive_id", d.id)
            .order("captured_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          const lastCaptured = latest?.captured_at ?? null;
          const hoursAgo = lastCaptured
            ? (Date.now() - new Date(lastCaptured).getTime()) / (1000 * 60 * 60)
            : Infinity;

          const staleThresholdHours = d.cadence === "daily" ? 24 : 168;
          const isStale = hoursAgo > staleThresholdHours;
          const feedCount = RSS_FEED_MAP[d.name]?.length ?? 0;

          results.push({
            name: d.name,
            cadence: d.cadence,
            last_signal: lastCaptured,
            hours_since_last: Math.round(hoursAgo),
            is_stale: isStale,
            feed_count: feedCount,
          });
        }

        const staleCount = results.filter((r) => r.is_stale).length;
        return { directives: results, total: results.length, stale: staleCount };
      },
    },
    {
      name: "ingest_directive",
      description: "Ingest RSS feeds for a specific directive by name. Returns inserted and skipped counts.",
      execute: async (params) => {
        const directiveName = params.directive_name as string;
        if (!directiveName) return { error: "directive_name required" };

        const supabase = supabaseAdmin();
        const { data: directive } = await supabase
          .from("research_directives")
          .select("id, name")
          .eq("workspace_id", workspaceId)
          .eq("name", directiveName)
          .maybeSingle();

        if (!directive) return { error: `Directive "${directiveName}" not found` };

        const feedUrls = RSS_FEED_MAP[directiveName] ?? [];
        if (feedUrls.length === 0) return { error: `No feeds mapped for "${directiveName}"` };

        const Parser = (await import("rss-parser")).default;
        const parser = new Parser();
        const crypto = await import("crypto");

        let inserted = 0;
        let skipped = 0;

        for (const feedUrl of feedUrls) {
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
              const { data: created } = await supabase
                .from("sources")
                .insert({ workspace_id: workspaceId, name: publisher, type: "rss", base_url: feedUrl, trust_score: 0.7 })
                .select("id")
                .single();
              sourceId = created?.id;
            }

            const items = (feed.items ?? []).slice(0, 15);
            for (const item of items) {
              const url = item.link?.trim();
              const title = item.title?.trim();
              if (!url || !title) { skipped++; continue; }

              const dh = crypto.createHash("sha256").update(`${url}|${title}|${publisher}`).digest("hex");
              const publishedAt = item.isoDate ? new Date(item.isoDate).toISOString() : null;

              const { error } = await supabase.from("signals").insert({
                workspace_id: workspaceId,
                source_id: sourceId,
                directive_id: directive.id,
                url, title, publisher,
                published_at: publishedAt,
                raw_text: item.contentSnippet || item.content || null,
                normalized_summary: item.contentSnippet || null,
                relevance_score: 0.0, trust_score: 0.7,
                dedupe_hash: dh,
                tags_json: [directiveName],
              });
              if (error) skipped++;
              else inserted++;
            }
          } catch {
            skipped++;
          }
        }

        return { directive: directiveName, feeds_checked: feedUrls.length, inserted, skipped };
      },
    },
    {
      name: "report_summary",
      description: "Generate a summary of research activity. Provide total_inserted and total_skipped from your ingest runs.",
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
    systemPrompt: `You are the Researcher Agent in a newsroom. Your job is to keep the signal database fresh.

Your workflow:
1. First, call check_signal_freshness to see which directives have stale signals.
2. For each stale directive, call ingest_directive to pull fresh RSS content.
3. Skip directives that are already fresh (not stale).
4. After ingesting, call report_summary with the total counts.
5. Signal done with a summary of what you did.

Be efficient. Only ingest stale directives. Report what you found.`,
    tools: createResearcherTools(workspaceId),
    maxIterations: 15,
  };
}
