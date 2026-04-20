"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Play, Loader2, CheckCircle2, XCircle, Clock, Bot, ChevronDown, ChevronUp, Newspaper, ListChecks } from "lucide-react";
import { PageHeader } from "../components/page-header";
import { cn } from "@/lib/utils";
import { studioInner } from "@/lib/studio/inner-classes";

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
  const [consoleLines, setConsoleLines] = useState<string[]>([]);

  const logConsole = (line: string) => {
    const ts = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    setConsoleLines((prev) => [...prev.slice(-120), `‹ [${ts}] ${line}`]);
  };

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
    logConsole(`Manual ingest: ${mode} cadence…`);
    try {
      const endpoint = mode === "all" ? "/api/research/run-all" : "/api/research/run-directives";
      const body = mode === "all" ? { limitPerFeed: 10 } : { cadence: mode, limitPerFeed: 10 };
      const res = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      setMessage(data.ok ? `+${data.inserted ?? 0} inserted, ${data.skipped ?? 0} skipped` : (data.error ?? `Error: ${res.status}`));
      logConsole(data.ok ? `Ingest done (+${data.inserted ?? 0})` : `Ingest error: ${String(data.error ?? res.status)}`);
      await loadRuns();
    } finally { setRunning(null); }
  }

  async function runPipelineStages(stages: PipelineStage[]) {
    setPipelineRunning(true);
    setPipelineResult(null);
    setNextStepHint(null);
    setShowPipelineDetails(true);
    logConsole(`Agent pipeline: ${stages.join(" → ")}`);
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
      if (st) {
        for (const [k, v] of Object.entries(st)) {
          logConsole(`${k}: ${v.success ? "complete" : "failed"} — ${v.summary}`);
          for (const d of v.decisions ?? []) logConsole(`  ${d}`);
        }
      } else {
        logConsole("Pipeline returned no stage payload.");
      }
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
    if (status === "completed") return <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[#3F6B45]" />;
    if (status === "failed") return <XCircle className="h-3.5 w-3.5 shrink-0 text-[#C0442A]" />;
    return <Clock className="h-3.5 w-3.5 shrink-0 text-[#C8571E]" />;
  };

  return (
    <div className={studioInner.pageRoot}>
      <PageHeader
        variant="studio"
        title="Research console"
        description="Run the agent pipeline, trigger directive ingests, and inspect directives plus recent runs."
      />

      <div className={cn(studioInner.card, "mb-6")}>
        <div className={studioInner.sectionLabel}>
          <Bot className="h-3.5 w-3.5" />
          Agent pipeline
        </div>
        <p className={cn(studioInner.body, "mb-5 max-w-3xl")}>
          <strong className="text-[#1F1A14]">Researcher</strong> ingests RSS signals. <strong className="text-[#1F1A14]">Writer</strong> creates leads in{" "}
          <span className="font-[family-name:var(--font-geist-mono)] text-[11px]">pending_review</span> (human gate). Approve on{" "}
          <Link href="/leads" className={studioInner.link}>
            Leads
          </Link>
          , then run <strong className="text-[#1F1A14]">Generate newsletter draft</strong> for the Editor — or run all three when you have enough approved leads.
        </p>

        <div className="grid gap-3 sm:grid-cols-3">
          <button
            type="button"
            onClick={() => void runPipelineStages(["researcher", "writer"])}
            disabled={pipelineRunning}
            className={cn(
              studioInner.card,
              "!p-4 text-left shadow-none transition-colors hover:border-[#C8571E]/50 disabled:opacity-50"
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[14px] font-medium text-[#1F1A14]">Research + write leads</span>
              {pipelineRunning ? (
                <Loader2 className="h-4 w-4 animate-spin text-[#C8571E]" />
              ) : (
                <Play className="h-4 w-4 text-[#C8571E]" />
              )}
            </div>
            <p className={cn(studioInner.body, "mt-2 text-[12px]")}>Run daily directives and generate leads from findings.</p>
          </button>
          <button
            type="button"
            onClick={() => void runPipelineStages(["editor"])}
            disabled={pipelineRunning}
            className={cn(studioInner.card, "!p-4 text-left shadow-none transition-colors hover:border-[#C8571E]/50 disabled:opacity-50")}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[14px] font-medium text-[#1F1A14]">Generate newsletter draft</span>
              {pipelineRunning ? (
                <Loader2 className="h-4 w-4 animate-spin text-[#C8571E]" />
              ) : (
                <Newspaper className="h-4 w-4 text-[#6B5F4E]" />
              )}
            </div>
            <p className={cn(studioInner.body, "mt-2 text-[12px]")}>Editor agent on approved leads → issue draft.</p>
          </button>
          <button
            type="button"
            onClick={() => void runPipelineStages(["researcher", "writer", "editor"])}
            disabled={pipelineRunning}
            className={cn(studioInner.card, "!p-4 text-left shadow-none transition-colors hover:border-[#C8571E]/50 disabled:opacity-50")}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[14px] font-medium text-[#1F1A14]">Run full pipeline</span>
              {pipelineRunning ? (
                <Loader2 className="h-4 w-4 animate-spin text-[#C8571E]" />
              ) : (
                <Bot className="h-4 w-4 text-[#6B5F4E]" />
              )}
            </div>
            <p className={cn(studioInner.body, "mt-2 text-[12px]")}>Research → leads → draft in one pass.</p>
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          {pipelineResult && (
            <button
              type="button"
              onClick={() => setShowPipelineDetails(!showPipelineDetails)}
              className={cn(studioInner.link, "inline-flex items-center gap-1 text-xs")}
            >
              Agent decisions
              {showPipelineDetails ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
          )}
          {consoleLines.length > 0 && (
            <button type="button" onClick={() => setConsoleLines([])} className={cn(studioInner.link, "text-xs")}>
              Clear log
            </button>
          )}
        </div>

        {consoleLines.length > 0 && (
          <div
            className="mt-4 max-h-48 overflow-auto rounded-lg border border-[#E4D9C2] bg-[#F5EFE4] p-3 font-[family-name:var(--font-geist-mono)] text-[11px] leading-relaxed"
            role="log"
            aria-live="polite"
          >
            {consoleLines.map((line, idx) => (
              <div key={`${idx}-${line.slice(0, 24)}`} className={idx === consoleLines.length - 1 ? "text-[#1F1A14]" : "text-[#6B5F4E]"}>
                {line}
              </div>
            ))}
          </div>
        )}

        {nextStepHint === "approve_leads" && (
          <div className="mt-4 rounded-[10px] border border-[#C8571E]/30 bg-[#C8571E]/08 px-4 py-3 text-[13px] text-[#1F1A14]">
            <span className="font-medium">Next step:</span> Review and approve at least three leads on the{" "}
            <Link href="/leads" className={cn(studioInner.link, "inline-flex items-center gap-1")}>
              <ListChecks className="h-3.5 w-3.5" /> Leads
            </Link>{" "}
            page, then return here and run <strong>Generate newsletter draft</strong>.
          </div>
        )}
        {nextStepHint === "need_approvals" && (
          <div className="mt-4 rounded-[10px] border border-[#C0442A]/30 bg-[#C0442A]/08 px-4 py-3 text-[13px] text-[#1F1A14]">
            <span className="font-medium">Editor did not produce a draft.</span> The agent needs at least three <strong>approved</strong> leads.{" "}
            <Link href="/leads" className={studioInner.link}>
              Open Leads to approve
            </Link>
            , then run <strong>Generate newsletter draft</strong> again.
          </div>
        )}
        {nextStepHint === "draft_ready" && (
          <div className="mt-4 rounded-[10px] border border-[#3F6B45]/30 bg-[#3F6B45]/08 px-4 py-3 text-[13px] text-[#1F1A14]">
            <span className="font-medium">Draft generated.</span> Open{" "}
            <Link href="/issues" className={cn(studioInner.link, "inline-flex items-center gap-1")}>
              <Newspaper className="h-3.5 w-3.5" /> Issues
            </Link>{" "}
            to review, regenerate sections, export HTML, or publish.
          </div>
        )}

        {pipelineResult && showPipelineDetails && (
          <div className="mt-4 min-w-0 space-y-3">
            {Object.entries(pipelineResult).map(([stage, result]) => (
              <div
                key={stage}
                className={cn(
                  "min-w-0 max-w-full overflow-hidden rounded-lg border p-4",
                  result.success ? "border-[#3F6B45]/35 bg-[#3F6B45]/08" : "border-[#C0442A]/35 bg-[#C0442A]/08"
                )}
              >
                <div className="mb-2 flex min-w-0 items-center gap-2">
                  {result.success ? <CheckCircle2 className="h-4 w-4 shrink-0 text-[#3F6B45]" /> : <XCircle className="h-4 w-4 shrink-0 text-[#C0442A]" />}
                  <span className="font-[family-name:var(--font-geist-mono)] text-xs font-semibold uppercase tracking-wider text-[#1F1A14]">
                    {stage === "researcher" ? "Researcher Agent" : stage === "writer" ? "Writer Agent" : "Editor Agent"}
                  </span>
                </div>
                <div className="mb-2 min-w-0 break-words text-sm leading-relaxed text-[#1F1A14] [overflow-wrap:anywhere]">
                  {result.summary}
                </div>
                {result.decisions.length > 0 && (
                  <div className="min-w-0 space-y-1.5">
                    <div className="font-[family-name:var(--font-geist-mono)] text-[10px] uppercase tracking-widest text-[#6B5F4E]">
                      Decisions
                    </div>
                    <div className="max-h-56 min-w-0 overflow-y-auto overflow-x-auto rounded-md border border-[#E4D9C2] bg-[#F5EFE4] p-2">
                      {result.decisions.map((d, i) => (
                        <div key={i} className="flex items-start gap-2 py-0.5 font-[family-name:var(--font-geist-mono)] text-[11px] leading-snug text-[#1F1A14]">
                          <span className="mt-0.5 shrink-0 text-[#C8571E]">›</span>
                          <span className="min-w-0 flex-1 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{d}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={cn(studioInner.card, "mb-6")}>
        <div className={studioInner.sectionLabel}>
          <Play className="h-3.5 w-3.5" />
          Manual ingest
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => void runDirectives("all")} disabled={!!running} className={studioInner.btnSecondary}>
            {running === "all" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {running === "all" ? "Running all…" : "Run all directives"}
          </button>
          <button type="button" onClick={() => void runDirectives("daily")} disabled={!!running} className={studioInner.btnSecondary}>
            {running === "daily" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {running === "daily" ? "Running…" : "Run daily"}
          </button>
          <button type="button" onClick={() => void runDirectives("weekly")} disabled={!!running} className={studioInner.btnSecondary}>
            {running === "weekly" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {running === "weekly" ? "Running…" : "Run weekly"}
          </button>
          {message && (
            <span
              className={cn(
                "font-[family-name:var(--font-geist-mono)] text-[12px]",
                message.startsWith("+") ? "text-[#3F6B45]" : "text-[#C0442A]"
              )}
            >
              {message}
            </span>
          )}
        </div>
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
        <div className="min-w-0">
          <div className={studioInner.sectionLabel}>Directives ({directives.length})</div>
          <div className="overflow-hidden rounded-[14px] border border-[#E4D9C2] bg-[#FBF7EE]">
            {directives.map((d) => (
              <div key={d.id} className="border-b border-[#E4D9C2] px-5 py-4 last:border-b-0">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className="text-[14px] font-medium text-[#1F1A14]">{d.name}</span>
                  <span
                    className={cn(
                      studioInner.tag,
                      d.cadence === "daily" ? studioInner.tagOrange : ""
                    )}
                  >
                    {d.cadence}
                  </span>
                </div>
                {d.description && <p className={cn(studioInner.body, "text-[12px]")}>{d.description}</p>}
              </div>
            ))}
          </div>
        </div>

        <div className="min-w-0">
          <div className={studioInner.sectionLabel}>Recent runs</div>
          <div className="min-w-0 space-y-2">
            {runs.map((r, i) => (
              <div key={i} className={cn(studioInner.card, "!p-4 min-w-0 max-w-full overflow-hidden")}>
                <div className="mb-1 flex min-w-0 flex-wrap items-center gap-2">
                  {statusIcon(r.status)}
                  <span className="font-[family-name:var(--font-geist-mono)] text-xs font-semibold text-[#1F1A14]">{r.run_type}</span>
                  <span
                    className={cn(
                      "text-xs font-medium",
                      r.status === "completed"
                        ? "text-[#2d5231]"
                        : r.status === "failed"
                          ? "text-[#8B2E1F]"
                          : "text-[#6B5F4E]"
                    )}
                  >
                    {r.status}
                  </span>
                </div>
                <div className="text-xs text-[#6B5F4E]">
                  {r.started_at && new Date(r.started_at).toLocaleString()}
                  {r.finished_at && ` → ${new Date(r.finished_at).toLocaleTimeString()}`}
                </div>
                {r.output_refs_json && typeof r.output_refs_json === "object" && "inserted" in r.output_refs_json && (
                  <div className="mt-1 font-[family-name:var(--font-geist-mono)] text-xs text-[#3F6B45]">
                    +{(r.output_refs_json as { inserted?: number }).inserted ?? 0} inserted, {(r.output_refs_json as { skipped?: number }).skipped ?? 0} skipped
                  </div>
                )}
                {r.output_refs_json && typeof r.output_refs_json === "object" && "summary" in r.output_refs_json && (
                  <div className="mt-2 min-w-0 break-words text-[13px] leading-relaxed text-[#1F1A14] [overflow-wrap:anywhere]">
                    {(r.output_refs_json as { summary?: string }).summary}
                  </div>
                )}
                {r.output_refs_json && typeof r.output_refs_json === "object" && "decisions" in r.output_refs_json && (
                  <div className="mt-2 min-w-0 max-w-full">
                    <div className="mb-1 font-[family-name:var(--font-geist-mono)] text-[10px] uppercase tracking-widest text-[#6B5F4E]">
                      Log
                    </div>
                    <div className="max-h-64 min-w-0 overflow-y-auto overflow-x-auto rounded-md border border-[#E4D9C2] bg-[#F5EFE4] p-2">
                      {((r.output_refs_json as { decisions?: string[] }).decisions ?? []).map((d, j) => (
                        <div
                          key={j}
                          className="flex items-start gap-2 py-0.5 font-[family-name:var(--font-geist-mono)] text-[11px] leading-snug text-[#1F1A14]"
                        >
                          <span className="mt-0.5 shrink-0 text-[#C8571E]">›</span>
                          <span className="min-w-0 flex-1 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{d}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {r.error_message && (
                  <div className="mt-1 text-xs text-[#8B2E1F]">{r.error_message}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
