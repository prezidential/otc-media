"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Play, Loader2, CheckCircle2, XCircle, Clock, Bot, ChevronDown, ChevronUp, Newspaper, ListChecks } from "lucide-react";
import { PageHeader } from "../components/page-header";
import { cn } from "@/lib/utils";

type Directive = { id: string; name: string; description: string | null; cadence: string; active: boolean | null };
type Run = { run_type: string; status: string; started_at: string | null; finished_at: string | null; error_message: string | null; output_refs_json: Record<string, unknown> | null };

type PipelineStageResult = {
  success: boolean;
  summary: string;
  decisions: string[];
  data: Record<string, unknown>;
};

type PipelineStage = "researcher" | "writer" | "editor";

type NextStepHint = null | "approve_leads" | "need_approvals" | "draft_ready";

export default function ResearchPage() {
  const [directives, setDirectives] = useState<Directive[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [running, setRunning] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [pipelineRunning, setPipelineRunning] = useState(false);
  const [pipelineResult, setPipelineResult] = useState<Record<string, PipelineStageResult> | null>(null);
  const [showPipelineDetails, setShowPipelineDetails] = useState(true);
  const [nextStepHint, setNextStepHint] = useState<NextStepHint>(null);

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

  async function runPipelineStages(stages: PipelineStage[]) {
    setPipelineRunning(true);
    setPipelineResult(null);
    setNextStepHint(null);
    setShowPipelineDetails(true);
    try {
      const res = await fetch("/api/pipeline/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stages, triggered_by: "manual" }),
      });
      const data = await res.json().catch(() => ({}));
      setPipelineResult(data.stages ?? null);
      await loadRuns();

      const st = data.stages as Record<string, PipelineStageResult> | undefined;
      if (stages.includes("editor")) {
        const ed = st?.editor;
        if (ed?.success) setNextStepHint("draft_ready");
        else setNextStepHint("need_approvals");
      } else if (stages.includes("writer") && st?.writer?.success) {
        setNextStepHint("approve_leads");
      }
    } finally {
      setPipelineRunning(false);
    }
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

      <div className="rounded-xl border border-primary/30 bg-primary/5 p-5 mb-6">
        <div className="font-mono text-[11px] uppercase tracking-widest text-primary mb-4 flex items-center gap-2">
          <Bot className="h-3.5 w-3.5" />
          Agent Pipeline
        </div>
        <div className="text-sm text-foreground/80 mb-4">
          <strong>Researcher</strong> ingests RSS signals. <strong>Writer</strong> creates leads in <span className="font-mono text-xs">pending_review</span> (human gate).
          Approve leads on the <Link href="/leads" className="text-primary underline-offset-2 hover:underline">Leads</Link> page, then run{" "}
          <strong>Generate newsletter draft</strong> so the <strong>Editor</strong> can call issue generation. Or run all three in one go if you already have enough approved leads.
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <button
            type="button"
            onClick={() => void runPipelineStages(["researcher", "writer"])}
            disabled={pipelineRunning}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {pipelineRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {pipelineRunning ? "Running…" : "Research + write leads"}
          </button>
          <button
            type="button"
            onClick={() => void runPipelineStages(["editor"])}
            disabled={pipelineRunning}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-card px-5 py-2.5 text-sm font-semibold text-foreground hover:bg-accent disabled:opacity-50 transition-colors"
          >
            {pipelineRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Newspaper className="h-4 w-4" />}
            {pipelineRunning ? "Running…" : "Generate newsletter draft"}
          </button>
          <button
            type="button"
            onClick={() => void runPipelineStages(["researcher", "writer", "editor"])}
            disabled={pipelineRunning}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-4 py-2.5 text-sm font-medium text-primary hover:bg-primary/15 disabled:opacity-50 transition-colors"
          >
            {pipelineRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}
            {pipelineRunning ? "Running…" : "Run full pipeline"}
          </button>
          {pipelineResult && (
            <button
              type="button"
              onClick={() => setShowPipelineDetails(!showPipelineDetails)}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Agent decisions
              {showPipelineDetails ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
          )}
        </div>

        {nextStepHint === "approve_leads" && (
          <div className="mt-4 rounded-lg border border-warning/30 bg-warning/5 px-4 py-3 text-sm text-foreground">
            <span className="font-medium">Next step:</span> Review and approve at least three leads on the{" "}
            <Link href="/leads" className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline">
              <ListChecks className="h-3.5 w-3.5" /> Leads
            </Link>{" "}
            page, then return here and click <strong>Generate newsletter draft</strong>.
          </div>
        )}
        {nextStepHint === "need_approvals" && (
          <div className="mt-4 rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-foreground">
            <span className="font-medium">Editor did not produce a draft.</span> The agent needs at least three <strong>approved</strong> leads.{" "}
            <Link href="/leads" className="text-primary underline-offset-2 hover:underline">
              Open Leads to approve
            </Link>
            , then run <strong>Generate newsletter draft</strong> again.
          </div>
        )}
        {nextStepHint === "draft_ready" && (
          <div className="mt-4 rounded-lg border border-success/30 bg-success/5 px-4 py-3 text-sm text-foreground">
            <span className="font-medium">Draft generated.</span> Open{" "}
            <Link href="/issues" className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline">
              <Newspaper className="h-3.5 w-3.5" /> Issues
            </Link>{" "}
            to review, regenerate sections, export HTML, or publish.
          </div>
        )}

        {pipelineResult && showPipelineDetails && (
          <div className="mt-4 space-y-3">
            {Object.entries(pipelineResult).map(([stage, result]) => (
              <div key={stage} className={cn(
                "rounded-lg border p-4",
                result.success ? "border-success/30 bg-success/5" : "border-danger/30 bg-danger/5"
              )}>
                <div className="flex items-center gap-2 mb-2">
                  {result.success ? <CheckCircle2 className="h-4 w-4 text-success" /> : <XCircle className="h-4 w-4 text-danger" />}
                  <span className="font-mono text-xs font-semibold uppercase tracking-wider">
                    {stage === "researcher" ? "Researcher Agent" : stage === "writer" ? "Writer Agent" : "Editor Agent"}
                  </span>
                </div>
                <div className="text-sm mb-2">{result.summary}</div>
                {result.decisions.length > 0 && (
                  <div className="space-y-1">
                    <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Decisions</div>
                    {result.decisions.map((d, i) => (
                      <div key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                        <span className="text-primary mt-0.5">›</span>
                        <span>{d}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card p-5 mb-6">
        <div className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground mb-4 flex items-center gap-2">
          <Play className="h-3.5 w-3.5" />
          Manual Ingest Controls
        </div>
        <div className="flex gap-3 items-center flex-wrap">
          <button onClick={() => runDirectives("all")} disabled={!!running}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground hover:bg-accent disabled:opacity-50 transition-colors">
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
                {r.output_refs_json && typeof r.output_refs_json === "object" && "summary" in r.output_refs_json && (
                  <div className="mt-1 text-xs text-foreground/70">
                    {(r.output_refs_json as { summary?: string }).summary}
                  </div>
                )}
                {r.output_refs_json && typeof r.output_refs_json === "object" && "decisions" in r.output_refs_json && (
                  <div className="mt-1 space-y-0.5">
                    {((r.output_refs_json as { decisions?: string[] }).decisions ?? []).map((d, j) => (
                      <div key={j} className="text-[11px] text-muted-foreground flex items-start gap-1.5">
                        <span className="text-primary">›</span>
                        <span>{d}</span>
                      </div>
                    ))}
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
