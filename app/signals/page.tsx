"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Rss,
  ExternalLink,
  Loader2,
  Plus,
  PenLine,
  Clock,
  Activity,
  ChevronRight,
  ArrowUpRight,
} from "lucide-react";
import { PageHeader } from "../components/page-header";
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
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (24 * 60 * 60 * 1000));
}

export default function SignalsPage() {
  const [feedUrl, setFeedUrl] = useState("https://www.darkreading.com/rss.xml");
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastIngest, setLastIngest] = useState<Run | null>(null);
  const [freshCount, setFreshCount] = useState(0);
  const [justIngested, setJustIngested] = useState<{ inserted: number } | null>(null);

  const [showManual, setShowManual] = useState(false);
  const [manualTitle, setManualTitle] = useState("");
  const [manualUrl, setManualUrl] = useState("");
  const [manualPublisher, setManualPublisher] = useState("");
  const [manualNotes, setManualNotes] = useState("");
  const [manualSubmitting, setManualSubmitting] = useState(false);
  const [manualMessage, setManualMessage] = useState<string | null>(null);

  const [topicFilter, setTopicFilter] = useState<string>("All");
  const [promoteByKey, setPromoteByKey] = useState<Record<string, PromoteState>>({});
  const [hiddenSignalKeys, setHiddenSignalKeys] = useState<Set<string>>(() => new Set());

  const loadSignals = useCallback(async () => {
    const res = await fetch("/api/signals/list?limit=40&heat=1");
    const text = await res.text();
    let data: { signals?: Signal[] } = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = {};
    }
    setSignals(data.signals ?? []);
  }, []);

  async function ingest() {
    setResult(null);
    setLoading(true);
    setJustIngested(null);
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
      const inserted = Number((data as { inserted?: unknown }).inserted);
      if (res.ok && Number.isFinite(inserted) && inserted > 0) {
        setJustIngested({ inserted });
        window.setTimeout(() => setJustIngested(null), 12_000);
      }
      await loadSignals();
      await loadFreshness();
    } finally {
      setLoading(false);
    }
  }

  async function submitManualSignal() {
    if (!manualTitle.trim()) {
      setManualMessage("Title is required");
      return;
    }
    setManualSubmitting(true);
    setManualMessage(null);
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
        setManualTitle("");
        setManualUrl("");
        setManualPublisher("");
        setManualNotes("");
        await loadSignals();
      } else {
        setManualMessage(data.error ?? `Error: ${res.status}`);
      }
    } finally {
      setManualSubmitting(false);
    }
  }

  async function loadFreshness() {
    const runsRes = await fetch("/api/runs/list?limit=10");
    const runsText = await runsRes.text();
    let runsData: { runs?: Run[] } = {};
    try {
      runsData = runsText ? JSON.parse(runsText) : {};
    } catch {
      runsData = {};
    }
    const ingestRuns = (runsData.runs ?? []).filter((r) => r.run_type === "directive_ingest" && r.status === "completed");
    setLastIngest(ingestRuns[0] ?? null);

    const signalsRes = await fetch("/api/signals/list?limit=200");
    const signalsText = await signalsRes.text();
    let signalsData: { signals?: Signal[] } = {};
    try {
      signalsData = signalsText ? JSON.parse(signalsText) : {};
    } catch {
      signalsData = {};
    }
    const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
    const fresh = (signalsData.signals ?? []).filter((s) => new Date(s.captured_at).getTime() > cutoff);
    setFreshCount(fresh.length);
  }

  async function promoteToLead(s: Signal) {
    const key = s.id ?? s.url;
    setPromoteByKey((m) => ({ ...m, [key]: "loading" }));
    try {
      const res = await fetch("/api/leads/from-signal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: s.title,
          url: s.url,
          publisher: s.publisher,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setPromoteByKey((m) => ({ ...m, [key]: "ok" }));
        setHiddenSignalKeys((prev) => new Set(prev).add(key));
        window.setTimeout(() => {
          setPromoteByKey((m) => {
            const next = { ...m };
            delete next[key];
            return next;
          });
        }, 3000);
      } else {
        setPromoteByKey((m) => ({ ...m, [key]: "err" }));
      }
    } catch {
      setPromoteByKey((m) => ({ ...m, [key]: "err" }));
    }
  }

  useEffect(() => {
    void loadSignals();
    void loadFreshness();
  }, [loadSignals]);

  const isStale = lastIngest
    ? Date.now() - new Date(lastIngest.finished_at ?? lastIngest.started_at ?? "").getTime() > 3 * 24 * 60 * 60 * 1000
    : true;

  const lastIngestAt = lastIngest?.finished_at ?? lastIngest?.started_at ?? null;
  const staleDays = lastIngestAt ? daysSince(lastIngestAt) : null;

  const filteredSignals = useMemo(() => {
    return signals.filter((s) => {
      const key = s.id ?? s.url;
      if (hiddenSignalKeys.has(key)) return false;
      if (topicFilter === "All") return true;
      return inferTopicFromTitle(s.title) === topicFilter;
    });
  }, [signals, topicFilter, hiddenSignalKeys]);

  const insertedFromResult =
    result && !result.error && typeof result.inserted === "number" ? (result.inserted as number) : null;

  return (
    <div className={studioInner.pageRoot}>
      <PageHeader
        variant="studio"
        title="Signals"
        description="Ingest RSS feeds, inject manual topics, and promote strong signals into editorial leads."
      />

      {/* Pipeline breadcrumb */}
      <div className={cn(studioInner.cardPadSm, "mb-4 flex flex-wrap items-center justify-between gap-3")}>
        <div>
          <div className={studioInner.sectionLabel}>Pipeline</div>
          <nav className="flex flex-wrap items-center gap-x-1 gap-y-1 text-[13px] text-[#1F1A14]">
            <Link href="/research" className={studioInner.link}>
              Research
            </Link>
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[#9C8E78]" />
            <Link href="/leads" className={studioInner.link}>
              Leads
            </Link>
            <span className="text-[#6B5F4E] hidden sm:inline">(approve)</span>
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[#9C8E78]" />
            <Link href="/issues" className={studioInner.link}>
              Issues
            </Link>
            <span className="text-[#6B5F4E] hidden sm:inline">(draft)</span>
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[#9C8E78]" />
            <Link href="/outlines" className={studioInner.link}>
              Outlines
            </Link>
          </nav>
        </div>
        <div className="flex flex-col items-end gap-1 text-right">
          {justIngested ? (
            <span className={cn(studioInner.tag, studioInner.tagGreen, "!normal-case tracking-normal")}>
              +{justIngested.inserted} ingested
            </span>
          ) : isStale && lastIngestAt ? (
            <span className={cn(studioInner.tag, studioInner.tagOrange, "!normal-case tracking-normal")}>
              Stale · last ingest {staleDays != null ? `${staleDays}d` : "—"} ago
            </span>
          ) : lastIngestAt ? (
            <span className={cn(studioInner.tag, studioInner.tagGreen, "!normal-case tracking-normal")}>Fresh ingest</span>
          ) : (
            <span className={cn(studioInner.tag, studioInner.tagOrange, "!normal-case tracking-normal")}>No ingest yet</span>
          )}
        </div>
      </div>

      {/* Freshness strip */}
      <div className={cn(studioInner.cardPadSm, "mb-4 flex flex-wrap items-center gap-4 text-[13px]")}>
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
              {lastIngest.output_refs_json &&
                typeof lastIngest.output_refs_json === "object" &&
                "inserted" in lastIngest.output_refs_json && (
                  <span className="ml-1 font-[family-name:var(--font-geist-mono)] text-[12px] text-[#C8571E]">
                    (+
                    {(lastIngest.output_refs_json as { inserted?: number }).inserted ?? 0})
                  </span>
                )}
            </span>
          ) : (
            <span className="text-[#C8571E]">No directive ingests yet</span>
          )}
        </div>
      </div>

      {/* RSS */}
      <div className={cn(studioInner.card, "mb-4")}>
        <div className={studioInner.sectionLabel}>
          <Rss className="h-3.5 w-3.5" />
          RSS feed ingest
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
          <input
            value={feedUrl}
            onChange={(e) => setFeedUrl(e.target.value)}
            placeholder="Enter RSS feed URL…"
            className={cn(studioInner.input, "flex-1")}
          />
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => void ingest()}
              disabled={loading}
              className={cn(
                studioInner.btnPrimary,
                "relative min-w-[140px] overflow-hidden !rounded-full"
              )}
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading ? `Ingesting…${insertedFromResult != null ? ` ${insertedFromResult}` : ""}` : "Ingest feed"}
              {loading && (
              <span
                className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-gradient-to-r from-transparent via-[#E8A24A] to-transparent opacity-90 animate-pulse"
                aria-hidden
              />
            )}
            </button>
          </div>
        </div>
        {result && (
          <div
            className={cn(
              "mt-3 rounded-[10px] border px-4 py-3 font-[family-name:var(--font-geist-mono)] text-[12px]",
              result.error
                ? "border-[#C0442A]/40 bg-[#C0442A]/08 text-[#8B2E1F]"
                : "border-[#3F6B45]/30 bg-[#3F6B45]/08 text-[#2F4D33]"
            )}
          >
            {result.error
              ? `Error: ${String(result.error)}`
              : `+${result.inserted ?? 0} inserted, ${result.skipped ?? 0} skipped`}
          </div>
        )}
      </div>

      {/* Manual */}
      <div className={cn(studioInner.card, "mb-6")}>
        <button
          type="button"
          onClick={() => setShowManual(!showManual)}
          className="flex w-full items-center justify-between text-left"
        >
          <div className={studioInner.sectionLabel}>
            <PenLine className="h-3.5 w-3.5" />
            Manual topic injection
          </div>
          <Plus className={cn("h-4 w-4 text-[#6B5F4E] transition-transform", showManual && "rotate-45")} />
        </button>
        {showManual && (
          <div className="mt-4 space-y-3 border-t border-[#E4D9C2] pt-4">
            <input
              value={manualTitle}
              onChange={(e) => setManualTitle(e.target.value)}
              placeholder="Title (required)"
              className={studioInner.input + " w-full"}
            />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <input
                value={manualUrl}
                onChange={(e) => setManualUrl(e.target.value)}
                placeholder="URL (optional)"
                className={studioInner.input}
              />
              <input
                value={manualPublisher}
                onChange={(e) => setManualPublisher(e.target.value)}
                placeholder="Publisher (optional)"
                className={studioInner.input}
              />
            </div>
            <textarea
              value={manualNotes}
              onChange={(e) => setManualNotes(e.target.value)}
              placeholder="Notes / summary (optional)"
              rows={3}
              className={studioInner.textarea + " resize-none"}
            />
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void submitManualSignal()}
                disabled={manualSubmitting}
                className={studioInner.btnPrimary}
              >
                {manualSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {manualSubmitting ? "Adding…" : "Add signal"}
              </button>
              {manualMessage && (
                <span
                  className={cn(
                    "text-[13px] font-[family-name:var(--font-geist-mono)]",
                    manualMessage === "Signal added" ? "text-[#3F6B45]" : "text-[#C0442A]"
                  )}
                >
                  {manualMessage}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className={studioInner.sectionLabel}>Latest signals ({filteredSignals.length})</div>
        <div className="flex flex-wrap gap-1.5">
          {STUDIO_TOPIC_FILTERS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTopicFilter(t)}
              className={cn(
                "rounded-full px-3 py-1 text-[11px] font-medium transition-colors",
                topicFilter === t ? "bg-[#1F1A14] text-[#F5EFE4]" : "bg-[#EBDFC5] text-[#6B5F4E] hover:bg-[#E4D9C2]"
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

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
                  <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#9C8E78] opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
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
                  onClick={(e) => {
                    e.preventDefault();
                    void promoteToLead(s);
                  }}
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
                    <>
                      <ArrowUpRight className="h-3.5 w-3.5" /> Lead
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {filteredSignals.length === 0 && (
        <div className="mt-10 flex flex-col items-center rounded-[14px] border border-dashed border-[#E4D9C2] bg-[#FBF7EE]/80 px-6 py-14 text-center">
          <p className="font-[family-name:var(--font-instrument-serif)] text-xl italic text-[#6B5F4E]">No signals in this view</p>
          <p className={cn(studioInner.body, "mt-2 max-w-md")}>
            Adjust topic filters, ingest a feed, or promote the last items to leads.
          </p>
        </div>
      )}

    </div>
  );
}
