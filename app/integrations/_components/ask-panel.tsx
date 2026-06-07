"use client";

import { useState } from "react";
import { Sparkles, Send, Loader2, AlertCircle } from "lucide-react";
import { studioInner } from "@/lib/studio/inner-classes";
import { cn } from "@/lib/utils";

type QueryResult = { ok: boolean; summary: string; data: Record<string, unknown>; error?: string };
export type AskPlatform = { id: string; name: string; suggested: string[] };
type Turn = { platform: string; q: string; result: QueryResult | null };

/**
 * Conversational "ask your data" panel. Runs the integration agent (MCP tools)
 * for the selected platform via /api/integrations/[platform]/query and keeps a
 * visible transcript. Reused on the per-platform page and the Analytics dashboard.
 */
export function AskPanel({ platforms }: { platforms: AskPlatform[] }) {
  const [selected, setSelected] = useState(platforms[0]?.id ?? "");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [showRaw, setShowRaw] = useState<number | null>(null);

  if (platforms.length === 0) return null;
  const current = platforms.find((p) => p.id === selected) ?? platforms[0];

  async function ask(q: string) {
    const question = q.trim();
    if (!question || loading || !selected) return;
    setQuery("");
    setLoading(true);
    const idx = turns.length;
    setTurns((t) => [...t, { platform: selected, q: question, result: null }]);
    try {
      const res = await fetch(`/api/integrations/${selected}/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: question }),
      });
      const data = (await res.json().catch(() => ({ ok: false, summary: "", data: {}, error: "Request failed" }))) as QueryResult;
      setTurns((t) => t.map((turn, i) => (i === idx ? { ...turn, result: data } : turn)));
    } catch {
      setTurns((t) =>
        t.map((turn, i) => (i === idx ? { ...turn, result: { ok: false, summary: "", data: {}, error: "Network error" } } : turn))
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className={studioInner.card}>
      <div className="flex items-center justify-between mb-3 gap-3">
        <p className={cn(studioInner.sectionLabel, "flex items-center gap-1.5")}>
          <Sparkles className="h-3.5 w-3.5" /> Ask your data
        </p>
        {platforms.length > 1 && (
          <div className="flex items-center gap-1">
            {platforms.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelected(p.id)}
                className={cn(
                  "rounded-lg px-3 py-1 text-[11px] font-medium transition-colors",
                  selected === p.id ? "bg-[#C8571E]/15 text-[#C8571E]" : "text-[#6B5F4E] hover:bg-[#EBDFC5]/50"
                )}
              >
                {p.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {turns.length > 0 && (
        <div className="space-y-3 mb-4">
          {turns.map((turn, i) => (
            <div key={i} className="space-y-1.5">
              <p className="text-[13px] font-medium text-[#1F1A14]">
                <span className="font-mono text-[9px] uppercase tracking-wider text-[#6B5F4E] mr-2">{turn.platform}</span>
                {turn.q}
              </p>
              <div className={cn(studioInner.surfaceNested, "rounded-lg p-3")}>
                {!turn.result ? (
                  <span className="text-[13px] text-[#6B5F4E] flex items-center gap-1.5">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking…
                  </span>
                ) : turn.result.ok ? (
                  <>
                    <p className="text-[13px] leading-relaxed text-[#1F1A14] whitespace-pre-wrap">{turn.result.summary}</p>
                    <button
                      type="button"
                      onClick={() => setShowRaw(showRaw === i ? null : i)}
                      className="mt-1.5 text-[11px] text-[#6B5F4E] hover:underline"
                    >
                      {showRaw === i ? "Hide raw data" : "Show raw data"}
                    </button>
                    {showRaw === i && <pre className={studioInner.draftBodyPreMono}>{JSON.stringify(turn.result.data, null, 2)}</pre>}
                  </>
                ) : (
                  <p className="text-[13px] text-[#C8571E] flex items-center gap-1.5">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    {turn.result.error ?? "Query failed"}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2 mb-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void ask(query)}
          placeholder={`Ask about your ${current?.name ?? ""} data…`}
          className={cn(studioInner.input, "flex-1")}
        />
        <button type="button" onClick={() => void ask(query)} disabled={loading || !query.trim()} className={studioInner.btnPrimary}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {(current?.suggested ?? []).map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => void ask(q)}
            disabled={loading}
            className="rounded-full border border-[#E4D9C2] px-3 py-1 text-[11px] text-[#6B5F4E] hover:bg-[#EBDFC5]/50 transition-colors disabled:opacity-50"
          >
            {q}
          </button>
        ))}
      </div>
    </section>
  );
}
