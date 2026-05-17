"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ExternalLink, Loader2, Clock, Activity, ChevronRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { inferTopicFromTitle, STUDIO_TOPIC_FILTERS } from "@/lib/dashboard/inferTopic";
import { studioInner } from "@/lib/studio/inner-classes";

type Signal = {
  id?: string;
  title: string;
  publisher: string;
  url: string;
  published_at: string | null;
  captured_at: string;
  heat?: number;
};

type Run = {
  run_type: string;
  status: string;
  started_at: string | null;
  finished_at: string | null;
  output_refs_json: Record<string, unknown> | null;
};

type PromoteState = "idle" | "loading" | "ok" | "err";

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (24 * 60 * 60 * 1000));
}

export function SignalFeedTab() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [lastIngest, setLastIngest] = useState<Run | null>(null);
  const [freshCount, setFreshCount] = useState(0);
  const [topicFilter, setTopicFilter] = useState<string>("All");
  const [promoteByKey, setPromoteByKey] = useState<Record<string, PromoteState>>({});
  const [hiddenSignalKeys, setHiddenSignalKeys] = useState<Set<string>>(() => new Set());

  const loadSignals = useCallback(async () => {
    const res = await fetch("/api/signals/list?limit=40&heat=1");
    const data = await res.json().catch(() => ({}));
    setSignals((data.signals as Signal[]) ?? []);
  }, []);

  const loadFreshness = useCallback(async () => {
    const [runsRes, signalsRes] = await Promise.all([
      fetch("/api/runs/list?limit=10"),
      fetch("/api/signals/list?limit=200"),
    ]);
    const runsData = await runsRes.json().catch(() => ({}));
    const ingestRuns = ((runsData.runs as Run[]) ?? []).filter(
      (r) => r.run_type === "directive_ingest" && r.status === "completed"
    );
    setLastIngest(ingestRuns[0] ?? null);

    const signalsData = await signalsRes.json().catch(() => ({}));
    const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
    const fresh = ((signalsData.signals as Signal[]) ?? []).filter(
      (s) => new Date(s.captured_at).getTime() > cutoff
    );
    setFreshCount(fresh.length);
  }, []);

  useEffect(() => {
    void loadSignals();
    void loadFreshness();
  }, [loadSignals, loadFreshness]);

  async function promoteToLead(s: Signal) {
    const key = s.id ?? s.url;
    setPromoteByKey((m) => ({ ...m, [key]: "loading" }));
    try {
      const res = await fetch("/api/leads/from-signal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: s.title, url: s.url, publisher: s.publisher }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setPromoteByKey((m) => ({ ...m, [key]: "ok" }));
        setHiddenSignalKeys((prev) => new Set(prev).add(key));
        window.setTimeout(() => {
          setPromoteByKey((m) => { const n = { ...m }; delete n[key]; return n; });
        }, 3000);
      } else {
        setPromoteByKey((m) => ({ ...m, [key]: "err" }));
      }
    } catch {
      setPromoteByKey((m) => ({ ...m, [key]: "err" }));
    }
  }

  const isStale = lastIngest
    ? Date.now() - new Date(lastIngest.finished_at ?? lastIngest.started_at ?? "").getTime() >
      3 * 24 * 60 * 60 * 1000
    : true;
  const lastIngestAt = lastIngest?.finished_at ?? lastIngest?.started_at ?? null;
  const staleDays = lastIngestAt ? daysSince(lastIngestAt) : null;

  const filteredSignals = useMemo(
    () =>
      signals.filter((s) => {
        const key = s.id ?? s.url;
        if (hiddenSignalKeys.has(key)) return false;
        if (topicFilter === "All") return true;
        return inferTopicFromTitle(s.title) === topicFilter;
      }),
    [signals, topicFilter, hiddenSignalKeys]
  );

  return (
    <div className="space-y-4">
      {/* Freshness strip */}
      <div className={cn(studioInner.cardPadSm, "flex flex-wrap items-center gap-4 text-[13px]")}>
        <div className="flex items-center gap-2">
          <Activity className={cn("h-4 w-4", isStale ? "text-[#C8571E]" : "text-[#3F6B45]")} />
          <span className="font-medium text-[#1F1A14]">
            {freshCount} fresh signals
            <span className="font-normal text-[#6B5F4E]"> (last 14 days)</span>
          </span>
        </div>
        <div className="flex items-center gap-2 text-[#6B5F4E]">
          <Clock className="h-3.5 w-3.5 shrink-0" />
          {lastIngest ? (
            <span>
              Last ingest: {timeAgo(lastIngest.finished_at ?? lastIngest.started_at ?? "")}
              {lastIngest.output_refs_json && "inserted" in lastIngest.output_refs_json && (
                <span className="ml-1 font-[family-name:var(--font-geist-mono)] text-[12px] text-[#C8571E]">
                  (+{(lastIngest.output_refs_json as { inserted?: number }).inserted ?? 0})
                </span>
              )}
            </span>
          ) : (
            <span className="text-[#C8571E]">No ingests yet</span>
          )}
        </div>
        {lastIngestAt && (
          <div className="ml-auto">
            {isStale ? (
              <span className={cn(studioInner.tag, studioInner.tagOrange, "!normal-case tracking-normal")}>
                Stale · {staleDays != null ? `${staleDays}d` : "—"} ago
              </span>
            ) : (
              <span className={cn(studioInner.tag, studioInner.tagGreen, "!normal-case tracking-normal")}>
                Fresh
              </span>
            )}
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className={studioInner.sectionLabel}>Signals ({filteredSignals.length})</div>
        <div className="flex flex-wrap gap-1.5">
          {STUDIO_TOPIC_FILTERS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTopicFilter(t)}
              className={cn(
                "rounded-full px-3 py-1 text-[11px] font-medium transition-colors",
                topicFilter === t
                  ? "bg-[#1F1A14] text-[#F5EFE4]"
                  : "bg-[#EBDFC5] text-[#6B5F4E] hover:bg-[#E4D9C2]"
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Signal rows */}
      <div className="space-y-2">
        {filteredSignals.map((s) => {
          const key = s.id ?? s.url;
          const topic = inferTopicFromTitle(s.title);
          const heat = typeof s.heat === "number" ? s.heat : 50;
          const p = promoteByKey[key] ?? "idle";
          const idDisplay = s.id ? String(s.id).replace(/-/g, "").slice(0, 6) : "—";

          return (
            <div
              key={key}
              className="group grid grid-cols-[28px_1fr_auto_auto_90px] items-center gap-x-3 gap-y-2 rounded-[14px] border border-[#E4D9C2] bg-[#FBF7EE] px-4 py-3 shadow-[0_1px_0_rgba(30,20,10,0.04),0_10px_24px_-16px_rgba(60,40,10,0.14)] transition-colors hover:bg-[#EBDFC5]/60"
            >
              <div className="flex h-full flex-col items-end justify-start pt-0.5 font-[family-name:var(--font-geist-mono)] text-[10px] leading-none text-[#9C8E78]">
                <span className="tabular-nums">{idDisplay}</span>
              </div>
              <div className="min-w-0">
                <a
                  href={s.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-start gap-2 text-[15px] font-medium leading-snug text-[#1F1A14] hover:text-[#C8571E]"
                >
                  <span className="min-w-0">{s.title}</span>
                  <ExternalLink
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#9C8E78] opacity-0 transition-opacity group-hover:opacity-100"
                    aria-hidden
                  />
                </a>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-[#6B5F4E]">
                  <span className="font-[family-name:var(--font-geist-mono)]">{s.publisher}</span>
                  {s.published_at && (
                    <>
                      <span className="text-[#E4D9C2]">·</span>
                      <span>{new Date(s.published_at).toLocaleDateString()}</span>
                    </>
                  )}
                  {s.id && (
                    <>
                      <span className="text-[#E4D9C2]">·</span>
                      <Link
                        href={`/brainstorm?signalId=${encodeURIComponent(String(s.id))}`}
                        className={studioInner.link}
                      >
                        Brainstorm
                        <ChevronRight className="inline h-3 w-3" />
                      </Link>
                    </>
                  )}
                </div>
              </div>
              <span className={cn(studioInner.tag, "justify-self-start")}>{topic}</span>
              <div className="h-1 w-12 shrink-0 overflow-hidden rounded-full bg-[#E4D9C2]">
                <div
                  className="h-full rounded-full bg-[#C8571E] transition-[width] duration-500"
                  style={{ width: `${heat}%` }}
                />
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  disabled={p === "loading"}
                  onClick={(e) => { e.preventDefault(); void promoteToLead(s); }}
                  className={cn(
                    studioInner.btnPositive,
                    "!px-3 !py-1.5 !text-[12px] opacity-0 transition-opacity duration-100 group-hover:opacity-100",
                    p === "loading" && "opacity-100",
                    p === "err" && "!bg-[#C0442A]/90"
                  )}
                >
                  {p === "loading" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : p === "err" ? (
                    "Retry"
                  ) : p === "ok" ? (
                    "Done"
                  ) : (
                    <><ArrowUpRight className="h-3.5 w-3.5" /> Lead</>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {filteredSignals.length === 0 && (
        <div className="mt-10 flex flex-col items-center rounded-[14px] border border-dashed border-[#E4D9C2] bg-[#FBF7EE]/80 px-6 py-14 text-center">
          <p className="font-[family-name:var(--font-instrument-serif)] text-xl italic text-[#6B5F4E]">
            No signals in this view
          </p>
          <p className={cn(studioInner.body, "mt-2 max-w-md")}>
            Approve sources and run the Researcher Agent to populate this feed, or adjust the topic
            filter.
          </p>
        </div>
      )}
    </div>
  );
}
