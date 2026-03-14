"use client";

import { useEffect, useState } from "react";
import { Rss, ExternalLink, Loader2, Plus, PenLine, Clock, Activity } from "lucide-react";
import { PageHeader } from "./components/page-header";
import { cn } from "@/lib/utils";

type Signal = {
  title: string;
  publisher: string;
  url: string;
  published_at: string | null;
  captured_at: string;
};

type Run = {
  run_type: string;
  status: string;
  started_at: string | null;
  finished_at: string | null;
  output_refs_json: Record<string, unknown> | null;
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function Home() {
  const [feedUrl, setFeedUrl] = useState("https://www.darkreading.com/rss.xml");
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastIngest, setLastIngest] = useState<Run | null>(null);
  const [freshCount, setFreshCount] = useState(0);

  const [showManual, setShowManual] = useState(false);
  const [manualTitle, setManualTitle] = useState("");
  const [manualUrl, setManualUrl] = useState("");
  const [manualPublisher, setManualPublisher] = useState("");
  const [manualNotes, setManualNotes] = useState("");
  const [manualSubmitting, setManualSubmitting] = useState(false);
  const [manualMessage, setManualMessage] = useState<string | null>(null);

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
      await loadFreshness();
    } finally {
      setLoading(false);
    }
  }

  async function submitManualSignal() {
    if (!manualTitle.trim()) { setManualMessage("Title is required"); return; }
    setManualSubmitting(true); setManualMessage(null);
    try {
      const res = await fetch("/api/signals/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: manualTitle,
          url: manualUrl || undefined,
          publisher: manualPublisher || undefined,
          notes: manualNotes || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.ok) {
        setManualMessage("Signal added");
        setManualTitle(""); setManualUrl(""); setManualPublisher(""); setManualNotes("");
        await loadSignals();
      } else {
        setManualMessage(data.error ?? `Error: ${res.status}`);
      }
    } finally { setManualSubmitting(false); }
  }

  async function loadSignals() {
    const res = await fetch("/api/signals/list?limit=25");
    const text = await res.text();
    let data: { signals?: Signal[] } = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
    setSignals(data.signals ?? []);
  }

  async function loadFreshness() {
    const runsRes = await fetch("/api/runs/list?limit=10");
    const runsText = await runsRes.text();
    let runsData: { runs?: Run[] } = {};
    try { runsData = runsText ? JSON.parse(runsText) : {}; } catch { runsData = {}; }
    const ingestRuns = (runsData.runs ?? []).filter((r) => r.run_type === "directive_ingest" && r.status === "completed");
    setLastIngest(ingestRuns[0] ?? null);

    const signalsRes = await fetch("/api/signals/list?limit=200");
    const signalsText = await signalsRes.text();
    let signalsData: { signals?: Signal[] } = {};
    try { signalsData = signalsText ? JSON.parse(signalsText) : {}; } catch { signalsData = {}; }
    const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
    const fresh = (signalsData.signals ?? []).filter((s) => new Date(s.captured_at).getTime() > cutoff);
    setFreshCount(fresh.length);
  }

  useEffect(() => { loadSignals(); loadFreshness(); }, []);

  const isStale = lastIngest ? (Date.now() - new Date(lastIngest.finished_at ?? lastIngest.started_at ?? "").getTime()) > 3 * 24 * 60 * 60 * 1000 : true;

  return (
    <div className="p-6 lg:p-10 max-w-[1100px]">
      <PageHeader title="Signals" description="Ingest RSS feeds and browse captured signals" />

      <div className="rounded-xl border border-border bg-card p-4 mb-4">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Activity className={cn("h-4 w-4", isStale ? "text-warning" : "text-success")} />
            <span className="text-sm font-medium">
              {freshCount} fresh signals
              <span className="text-muted-foreground font-normal"> (last 14 days)</span>
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            {lastIngest ? (
              <span>
                Last ingest: {timeAgo(lastIngest.finished_at ?? lastIngest.started_at ?? "")}
                {lastIngest.output_refs_json && typeof lastIngest.output_refs_json === "object" && "inserted" in lastIngest.output_refs_json && (
                  <span className="text-primary font-mono"> (+{(lastIngest.output_refs_json as { inserted?: number }).inserted ?? 0})</span>
                )}
              </span>
            ) : (
              <span className="text-warning">No ingests yet</span>
            )}
          </div>
          {isStale && (
            <span className="rounded-full bg-warning/15 px-3 py-1 text-[11px] font-mono uppercase tracking-wider text-warning">
              Stale — run Research directives
            </span>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5 mb-4">
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
          <button onClick={ingest} disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity whitespace-nowrap">
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {loading ? "Ingesting..." : "Ingest Feed"}
          </button>
        </div>
        {result && (
          <div className={`mt-3 rounded-lg px-4 py-3 text-sm font-mono ${
            (result as Record<string, unknown>).error ? "bg-danger/10 text-danger" : "bg-primary/10 text-primary"
          }`}>
            {(result as Record<string, unknown>).error
              ? `Error: ${(result as Record<string, unknown>).error}`
              : `+${(result as Record<string, unknown>).inserted ?? 0} inserted, ${(result as Record<string, unknown>).skipped ?? 0} skipped`}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card p-5 mb-6">
        <button onClick={() => setShowManual(!showManual)}
          className="w-full flex items-center justify-between">
          <div className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground flex items-center gap-2">
            <PenLine className="h-3.5 w-3.5" />
            Manual Topic Injection
          </div>
          <Plus className={cn("h-4 w-4 text-muted-foreground transition-transform", showManual && "rotate-45")} />
        </button>
        {showManual && (
          <div className="mt-4 space-y-3">
            <input value={manualTitle} onChange={(e) => setManualTitle(e.target.value)} placeholder="Title (required)"
              className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary" />
            <div className="grid grid-cols-2 gap-3">
              <input value={manualUrl} onChange={(e) => setManualUrl(e.target.value)} placeholder="URL (optional)"
                className="rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary" />
              <input value={manualPublisher} onChange={(e) => setManualPublisher(e.target.value)} placeholder="Publisher (optional)"
                className="rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary" />
            </div>
            <textarea value={manualNotes} onChange={(e) => setManualNotes(e.target.value)} placeholder="Notes / summary (optional)" rows={3}
              className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary resize-none" />
            <div className="flex items-center gap-3">
              <button onClick={submitManualSignal} disabled={manualSubmitting}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity">
                {manualSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {manualSubmitting ? "Adding..." : "Add Signal"}
              </button>
              {manualMessage && (
                <span className={`text-sm font-mono ${manualMessage === "Signal added" ? "text-primary" : "text-danger"}`}>
                  {manualMessage}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground mb-4">
        Latest Signals ({signals.length})
      </div>

      <div className="space-y-2">
        {signals.map((s, idx) => (
          <a key={idx} href={s.url} target="_blank" rel="noreferrer"
            className="group flex items-start justify-between gap-4 rounded-xl border border-border bg-card px-5 py-4 transition-colors hover:border-primary/50">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium leading-snug group-hover:text-primary transition-colors">{s.title}</div>
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
