"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Activity, RefreshCw, Loader2, CheckCircle2, XCircle, Clock, AlertTriangle, FlaskConical } from "lucide-react";
import { PageHeader } from "../components/page-header";
import { cn } from "@/lib/utils";
import {
  formatRunType,
  runStatusMeta,
  formatDuration,
  formatRelativeTime,
  summarizeRun,
  summarizeRuns,
  type RunRow,
  type RunStatusTone,
} from "@/lib/runs/format";

type Filter = "all" | "failed";

const TONE_BADGE: Record<RunStatusTone, string> = {
  success: "bg-success/15 text-success",
  danger: "bg-danger/15 text-danger",
  warning: "bg-warning/15 text-warning",
  muted: "bg-muted text-muted-foreground",
};

export default function RunsPage() {
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  async function loadRuns() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/runs/list?limit=50");
      const text = await res.text();
      let data: { runs?: RunRow[]; error?: string } = {};
      try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
      if (!res.ok) { setError(data.error ?? `Error: ${res.status}`); setRuns([]); return; }
      setRuns(data.runs ?? []);
    } catch {
      setError("Failed to reach the runs API.");
      setRuns([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadRuns();
  }, []);

  const stats = summarizeRuns(runs);
  const visibleRuns = filter === "failed" ? runs.filter((r) => r.status === "failed") : runs;

  return (
    <div className="p-6 lg:p-10 max-w-[1100px]">
      <PageHeader title="Pipeline Runs" description="Agent run history, failures, and last trigger across the newsroom pipeline" />

      <div className="grid grid-cols-2 gap-3 mb-6 sm:grid-cols-4">
        <StatCard icon={<Activity className="h-3.5 w-3.5" />} label="Total" value={stats.total} />
        <StatCard icon={<CheckCircle2 className="h-3.5 w-3.5 text-success" />} label="Completed" value={stats.completed} />
        <StatCard icon={<XCircle className="h-3.5 w-3.5 text-danger" />} label="Failed" value={stats.failed} />
        <StatCard
          icon={<Clock className="h-3.5 w-3.5 text-muted-foreground" />}
          label="Last run"
          value={stats.lastStartedAt ? formatRelativeTime(stats.lastStartedAt) : "—"}
        />
      </div>

      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={() => setFilter("all")}
          className={cn(
            "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors",
            filter === "all" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground"
          )}
        >
          <Activity className="h-4 w-4" />
          All Runs
        </button>
        <button
          onClick={() => setFilter("failed")}
          className={cn(
            "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors",
            filter === "failed" ? "bg-danger/15 text-danger" : "text-muted-foreground hover:bg-accent hover:text-foreground"
          )}
        >
          <AlertTriangle className="h-4 w-4" />
          Failures{stats.failed > 0 ? ` (${stats.failed})` : ""}
        </button>
        <span className="ml-1 font-mono text-[11px] text-muted-foreground">({visibleRuns.length})</span>
        <button
          onClick={loadRuns}
          disabled={loading}
          className="ml-auto inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-accent disabled:opacity-50 transition-colors"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-danger/30 bg-danger/5 p-4 mb-6 text-sm text-danger font-mono">
          {error}
        </div>
      )}

      <div className="space-y-3">
        {visibleRuns.map((run, i) => {
          const meta = runStatusMeta(run.status);
          const { summary, decisions } = summarizeRun(run.output_refs_json);
          return (
            <div
              key={`${run.run_type}-${run.started_at ?? "na"}-${i}`}
              className={cn(
                "rounded-xl border bg-card p-5",
                run.status === "failed" ? "border-danger/20" : "border-border"
              )}
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="text-sm font-semibold leading-snug">{formatRunType(run.run_type)}</div>
                <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold", TONE_BADGE[meta.tone])}>
                  {meta.label}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] text-muted-foreground mb-3">
                <span>{run.started_at ? formatRelativeTime(run.started_at) : "—"}</span>
                <span>Duration {formatDuration(run.started_at, run.finished_at)}</span>
              </div>

              {summary && <div className="text-xs leading-relaxed text-foreground mb-2">{summary}</div>}

              {decisions.length > 0 && (
                <ul className="mb-2 space-y-1">
                  {decisions.map((d, di) => (
                    <li key={di} className="flex gap-2 text-xs text-muted-foreground">
                      <span className="text-primary">›</span>
                      <span className="leading-relaxed">{d}</span>
                    </li>
                  ))}
                </ul>
              )}

              {run.error_message && (
                <div className="mt-2 rounded-lg border border-danger/20 bg-danger/5 px-3 py-2 text-xs font-mono text-danger whitespace-pre-wrap">
                  {run.error_message}
                </div>
              )}
            </div>
          );
        })}

        {!loading && visibleRuns.length === 0 && !error && (
          <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card py-16 text-muted-foreground">
            <Activity className="h-10 w-10 mb-3 opacity-40" />
            <span className="text-sm">{filter === "failed" ? "No failed runs" : "No pipeline runs yet"}</span>
            <span className="text-xs mt-1 flex items-center gap-1">
              {filter === "failed" ? (
                "Failures will appear here when an agent run fails"
              ) : (
                <>
                  Trigger the pipeline from the
                  <Link href="/research" className="inline-flex items-center gap-1 text-primary hover:underline">
                    <FlaskConical className="h-3 w-3" /> Research
                  </Link>
                  console
                </>
              )}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
        {icon}
        {label}
      </div>
      <div className="text-xl font-bold tracking-tight">{value}</div>
    </div>
  );
}
