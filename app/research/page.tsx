"use client";

import { useEffect, useState } from "react";
import { Play, Loader2, CheckCircle2, XCircle, Clock } from "lucide-react";
import { PageHeader } from "../components/page-header";

type Directive = { id: string; name: string; description: string | null; cadence: string; active: boolean | null };
type Run = { run_type: string; status: string; started_at: string | null; finished_at: string | null; error_message: string | null; output_refs_json: Record<string, unknown> | null };

export default function ResearchPage() {
  const [directives, setDirectives] = useState<Directive[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [running, setRunning] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function loadDirectives() {
    const res = await fetch("/api/research/list-directives");
    const text = await res.text();
    let data: { directives?: Directive[] } = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
    setDirectives(data.directives ?? []);
  }

  async function loadRuns() {
    const res = await fetch("/api/runs/list?limit=25");
    const text = await res.text();
    let data: { runs?: Run[] } = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
    setRuns(data.runs ?? []);
  }

  async function runDirectives(mode: "daily" | "weekly" | "all") {
    setRunning(mode);
    setMessage(null);
    try {
      const endpoint = mode === "all" ? "/api/research/run-all" : "/api/research/run-directives";
      const body = mode === "all" ? { limitPerFeed: 10 } : { cadence: mode, limitPerFeed: 10 };
      const res = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      setMessage(data.ok ? `+${data.inserted ?? 0} inserted, ${data.skipped ?? 0} skipped` : (data.error ?? `Error: ${res.status}`));
      await loadRuns();
    } finally { setRunning(null); }
  }

  useEffect(() => { loadDirectives(); loadRuns(); }, []);

  const statusIcon = (status: string) => {
    if (status === "completed") return <CheckCircle2 className="h-3.5 w-3.5 text-success" />;
    if (status === "failed") return <XCircle className="h-3.5 w-3.5 text-danger" />;
    return <Clock className="h-3.5 w-3.5 text-warning" />;
  };

  return (
    <div className="p-6 lg:p-10 max-w-[1100px]">
      <PageHeader title="Research Console" description="Manage directives and ingest signals from RSS feeds" />

      <div className="rounded-xl border border-border bg-card p-5 mb-6">
        <div className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground mb-4 flex items-center gap-2">
          <Play className="h-3.5 w-3.5" />
          Ingest Controls
        </div>
        <div className="flex gap-3 items-center flex-wrap">
          <button onClick={() => runDirectives("all")} disabled={!!running}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity">
            {running === "all" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {running === "all" ? "Running All..." : "Run All Directives"}
          </button>
          <button onClick={() => runDirectives("daily")} disabled={!!running}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground hover:bg-accent disabled:opacity-50 transition-colors">
            {running === "daily" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {running === "daily" ? "Running..." : "Run Daily"}
          </button>
          <button onClick={() => runDirectives("weekly")} disabled={!!running}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground hover:bg-accent disabled:opacity-50 transition-colors">
            {running === "weekly" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {running === "weekly" ? "Running..." : "Run Weekly"}
          </button>
          {message && (
            <span className={`text-sm font-mono ${message.startsWith("+") ? "text-primary" : "text-danger"}`}>
              {message}
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground mb-4">
            Directives ({directives.length})
          </div>
          <div className="space-y-2">
            {directives.map((d) => (
              <div key={d.id} className="rounded-xl border border-border bg-card px-5 py-4">
                <div className="flex items-center gap-2.5 mb-1.5">
                  <span className="text-sm font-semibold">{d.name}</span>
                  <span className={`font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full ${
                    d.cadence === "daily" ? "bg-primary/15 text-primary" : "bg-warning/15 text-warning"
                  }`}>
                    {d.cadence}
                  </span>
                </div>
                {d.description && (
                  <p className="text-xs text-muted-foreground leading-relaxed">{d.description}</p>
                )}
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground mb-4">
            Recent Runs
          </div>
          <div className="space-y-2">
            {runs.map((r, i) => (
              <div key={i} className="rounded-xl border border-border bg-card px-5 py-4">
                <div className="flex items-center gap-2 mb-1">
                  {statusIcon(r.status)}
                  <span className="font-mono text-xs font-semibold">{r.run_type}</span>
                  <span className={`text-xs font-medium ${
                    r.status === "completed" ? "text-success" : r.status === "failed" ? "text-danger" : "text-muted-foreground"
                  }`}>{r.status}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {r.started_at && new Date(r.started_at).toLocaleString()}
                  {r.finished_at && ` → ${new Date(r.finished_at).toLocaleTimeString()}`}
                </div>
                {r.output_refs_json && typeof r.output_refs_json === "object" && "inserted" in r.output_refs_json && (
                  <div className="mt-1 font-mono text-xs text-primary">
                    +{(r.output_refs_json as { inserted?: number }).inserted ?? 0} inserted, {(r.output_refs_json as { skipped?: number }).skipped ?? 0} skipped
                  </div>
                )}
                {r.error_message && (
                  <div className="mt-1 text-xs text-danger">{r.error_message}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
