"use client";

import { useEffect, useState } from "react";
import { Rss, ExternalLink, Loader2 } from "lucide-react";
import { PageHeader } from "./components/page-header";

type Signal = {
  title: string;
  publisher: string;
  url: string;
  published_at: string | null;
  captured_at: string;
};

export default function Home() {
  const [feedUrl, setFeedUrl] = useState("https://www.darkreading.com/rss.xml");
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(false);

  async function ingest() {
    setResult(null);
    setLoading(true);
    try {
      const res = await fetch("/api/ingest/rss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedUrl, limit: 10 }),
      });
      const text = await res.text();
      let data: unknown;
      try {
        data = text ? JSON.parse(text) : { error: res.statusText || "Empty response" };
      } catch {
        data = { error: text || res.statusText || "Invalid response" };
      }
      if (!res.ok) {
        data = {
          ...(typeof data === "object" && data && !Array.isArray(data) ? data : {}),
          error: (data as { error?: string })?.error ?? `HTTP ${res.status}`,
        };
      }
      setResult(data as Record<string, unknown>);
      await loadSignals();
    } finally {
      setLoading(false);
    }
  }

  async function loadSignals() {
    const res = await fetch("/api/signals/list?limit=25");
    const text = await res.text();
    let data: { signals?: Signal[] } = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
    setSignals(data.signals ?? []);
  }

  useEffect(() => { loadSignals(); }, []);

  return (
    <div className="p-6 lg:p-10 max-w-[1100px]">
      <PageHeader title="Signals" description="Ingest RSS feeds and browse captured signals" />

      <div className="rounded-xl border border-border bg-card p-5 mb-6">
        <div className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground mb-4 flex items-center gap-2">
          <Rss className="h-3.5 w-3.5" />
          RSS Feed Ingest
        </div>
        <div className="flex gap-3">
          <input
            value={feedUrl}
            onChange={(e) => setFeedUrl(e.target.value)}
            placeholder="Enter RSS feed URL..."
            className="flex-1 rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
          />
          <button
            onClick={ingest}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity whitespace-nowrap"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {loading ? "Ingesting..." : "Ingest Feed"}
          </button>
        </div>

        {result && (
          <div className={`mt-3 rounded-lg px-4 py-3 text-sm font-mono ${
            (result as Record<string, unknown>).error
              ? "bg-danger/10 text-danger"
              : "bg-primary/10 text-primary"
          }`}>
            {(result as Record<string, unknown>).error
              ? `Error: ${(result as Record<string, unknown>).error}`
              : `+${(result as Record<string, unknown>).inserted ?? 0} inserted, ${(result as Record<string, unknown>).skipped ?? 0} skipped`}
          </div>
        )}
      </div>

      <div className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground mb-4">
        Latest Signals ({signals.length})
      </div>

      <div className="space-y-2">
        {signals.map((s, idx) => (
          <a
            key={idx}
            href={s.url}
            target="_blank"
            rel="noreferrer"
            className="group flex items-start justify-between gap-4 rounded-xl border border-border bg-card px-5 py-4 transition-colors hover:border-primary/50"
          >
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium leading-snug group-hover:text-primary transition-colors">
                {s.title}
              </div>
              <div className="mt-1.5 flex items-center gap-3 text-xs text-muted-foreground">
                <span className="font-mono">{s.publisher}</span>
                {s.published_at && (
                  <>
                    <span className="text-border">·</span>
                    <span>{new Date(s.published_at).toLocaleDateString()}</span>
                  </>
                )}
              </div>
            </div>
            <ExternalLink className="mt-1 h-3.5 w-3.5 flex-shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
          </a>
        ))}
      </div>
    </div>
  );
}
