import type { SupabaseClient } from "@supabase/supabase-js";
import { collectUrlsFromDraft, normalizeUrlForMatch } from "./draftUrls";

export type GroundedSignal = {
  id: string;
  url: string;
  title: string;
  publisher: string | null;
  excerpt: string | null;
};

function excerptFromRow(row: { normalized_summary?: string | null; raw_text?: string | null }): string | null {
  const s = row.normalized_summary || row.raw_text;
  if (typeof s !== "string" || !s.trim()) return null;
  const t = s.trim();
  return t.length > 400 ? `${t.slice(0, 397)}…` : t;
}

/**
 * Resolve draft citation URLs to workspace signal rows (title, publisher, excerpt).
 */
export async function resolveSignalsForDraft(
  supabase: SupabaseClient,
  workspaceId: string,
  contentJson: Record<string, unknown>
): Promise<{ grounded: GroundedSignal[]; unmatchedUrls: string[] }> {
  const requested = collectUrlsFromDraft(contentJson);
  if (requested.length === 0) return { grounded: [], unmatchedUrls: [] };

  const { data, error } = await supabase
    .from("signals")
    .select("id,url,title,publisher,normalized_summary,raw_text")
    .eq("workspace_id", workspaceId);

  if (error || !data?.length) {
    return { grounded: [], unmatchedUrls: requested };
  }

  const byNorm = new Map<string, (typeof data)[0]>();
  for (const row of data) {
    if (typeof row.url !== "string") continue;
    byNorm.set(normalizeUrlForMatch(row.url), row);
  }

  const grounded: GroundedSignal[] = [];
  const unmatchedUrls: string[] = [];
  const seen = new Set<string>();

  for (const url of requested) {
    const key = normalizeUrlForMatch(url);
    if (seen.has(key)) continue;
    seen.add(key);
    const row = byNorm.get(key);
    if (row && typeof row.id === "string" && typeof row.title === "string") {
      grounded.push({
        id: row.id,
        url: row.url as string,
        title: row.title,
        publisher: typeof row.publisher === "string" ? row.publisher : null,
        excerpt: excerptFromRow(row),
      });
    } else {
      unmatchedUrls.push(url);
    }
  }

  return { grounded, unmatchedUrls };
}

export function formatSignalGroundingForPrompt(grounded: GroundedSignal[], unmatchedUrls: string[]): string {
  const lines: string[] = [
    "### Signal grounding",
    "You may name publications only for [resolved] items below. For [unresolved] URLs, refer generically (e.g. “one vendor write-up”, “industry coverage”) — never invent a specific outlet or article title.",
    "",
  ];
  for (const g of grounded) {
    const pub = g.publisher ? ` (${g.publisher})` : "";
    lines.push(`- [resolved] ${g.title}${pub}`);
    lines.push(`  URL: ${g.url}`);
    if (g.excerpt) lines.push(`  Excerpt: ${g.excerpt}`);
    lines.push("");
  }
  for (const u of unmatchedUrls) {
    lines.push(`- [unresolved] ${u}`);
  }
  if (grounded.length === 0 && unmatchedUrls.length === 0) {
    lines.push("(No citation URLs were extracted from this draft.)");
  }
  return lines.join("\n");
}
