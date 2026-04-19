"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ExternalLink,
  Loader2,
  Plus,
  PenLine,
  Rss,
  Search,
  Sparkles,
} from "lucide-react";
import type { DashboardStatsPayload } from "@/lib/dashboard/stats";
import { inferTopicFromTitle, STUDIO_TOPIC_FILTERS } from "@/lib/dashboard/inferTopic";
import { cn } from "@/lib/utils";
import { useStudioUI } from "../components/studio-ui-context";

const PANEL = "#FBF7EE";
const INK = "#1F1A14";
const SUB = "#6B5F4E";
const LINE = "#E4D9C2";
const ACCENT = "#C8571E";
const ACCENT2 = "#3F6B45";
const CHIP = "#EBDFC5";

const CARD_SHADOW =
  "0 1px 0 rgba(30,20,10,0.04), 0 14px 30px -18px rgba(60,40,10,0.18)";

const SNOOZE_KEY = "studio_nudge_snooze_until";

type SignalRow = {
  id?: string;
  title: string;
  publisher: string;
  url: string;
  published_at: string | null;
  captured_at: string;
  heat?: number;
};

function formatIngestAt(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

type PromoteState = "idle" | "loading" | "ok" | "err";

export default function DashboardPage() {
  const { openCommandPalette } = useStudioUI();
  const [stats, setStats] = useState<DashboardStatsPayload | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);

  const [feedUrl, setFeedUrl] = useState("https://www.darkreading.com/rss.xml");
  const [ingestResult, setIngestResult] = useState<Record<string, unknown> | null>(null);
  const [ingestLoading, setIngestLoading] = useState(false);

  const [showManual, setShowManual] = useState(false);
  const [manualTitle, setManualTitle] = useState("");
  const [manualUrl, setManualUrl] = useState("");
  const [manualPublisher, setManualPublisher] = useState("");
  const [manualNotes, setManualNotes] = useState("");
  const [manualBusy, setManualBusy] = useState(false);
  const [manualMsg, setManualMsg] = useState<string | null>(null);

  const [signals, setSignals] = useState<SignalRow[]>([]);
  const [topicFilter, setTopicFilter] = useState<string>("All");
  const [promoteByKey, setPromoteByKey] = useState<Record<string, PromoteState>>({});

  const [snoozeUntil, setSnoozeUntil] = useState<number | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SNOOZE_KEY);
      if (raw) {
        const n = Number(raw);
        if (Number.isFinite(n) && n > Date.now()) setSnoozeUntil(n);
        else localStorage.removeItem(SNOOZE_KEY);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const loadStats = useCallback(async () => {
    setStatsError(null);
    try {
      const res = await fetch("/api/dashboard/stats");
      const j = (await res.json()) as DashboardStatsPayload & { error?: string };
      if (!res.ok || ("error" in j && j.error)) {
        setStats(null);
        setStatsError((j as { error?: string }).error ?? `HTTP ${res.status}`);
        return;
      }
      setStats(j as DashboardStatsPayload);
    } catch (e) {
      setStatsError(e instanceof Error ? e.message : "Failed to load stats");
    }
  }, []);

  const loadSignals = useCallback(async () => {
    const res = await fetch("/api/signals/list?limit=40&heat=1");
    const data = (await res.json().catch(() => ({}))) as { signals?: SignalRow[]; error?: string };
    setSignals(data.signals ?? []);
  }, []);

  useEffect(() => {
    void loadStats();
    void loadSignals();
  }, [loadStats, loadSignals]);

  async function runIngest() {
    setIngestResult(null);
    setIngestLoading(true);
    try {
      const res = await fetch("/api/ingest/rss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedUrl, limit: 10 }),
      });
      const text = await res.text();
      let data: Record<string, unknown>;
      try {
        data = text ? (JSON.parse(text) as Record<string, unknown>) : { error: res.statusText };
      } catch {
        data = { error: text || "Invalid JSON" };
      }
      if (!res.ok) {
        data.error = (data.error as string) ?? `HTTP ${res.status}`;
      }
      setIngestResult(data);
      await loadSignals();
      await loadStats();
    } finally {
      setIngestLoading(false);
    }
  }

  async function submitManualSignal() {
    if (!manualTitle.trim()) {
      setManualMsg("Title is required");
      return;
    }
    setManualBusy(true);
    setManualMsg(null);
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
        setManualMsg("Signal added");
        setManualTitle("");
        setManualUrl("");
        setManualPublisher("");
        setManualNotes("");
        await loadSignals();
        await loadStats();
      } else {
        setManualMsg(data.error ?? `Error: ${res.status}`);
      }
    } finally {
      setManualBusy(false);
    }
  }

  async function promoteToLead(s: SignalRow) {
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
        await loadStats();
        window.setTimeout(() => {
          setPromoteByKey((m) => {
            const next = { ...m };
            if (next[key] === "ok") delete next[key];
            return next;
          });
        }, 4000);
      } else {
        setPromoteByKey((m) => ({ ...m, [key]: "err" }));
      }
    } catch {
      setPromoteByKey((m) => ({ ...m, [key]: "err" }));
    }
  }

  function snoozeNudge() {
    const until = Date.now() + 24 * 60 * 60 * 1000;
    try {
      localStorage.setItem(SNOOZE_KEY, String(until));
    } catch {
      /* ignore */
    }
    setSnoozeUntil(until);
  }

  const nudgeHidden = snoozeUntil != null && Date.now() < snoozeUntil;

  const filteredSignals = useMemo(() => {
    if (topicFilter === "All") return signals;
    return signals.filter((s) => inferTopicFromTitle(s.title) === topicFilter);
  }, [signals, topicFilter]);

  const pipelineSteps = useMemo(() => {
    if (!stats) return [];
    const ny = stats.needsYou;
    return [
      { key: "research" as const, label: "Research", href: "/research", ...stats.pipeline.research },
      { key: "leads" as const, label: "Leads", href: "/leads", ...stats.pipeline.leads },
      { key: "issues" as const, label: "Issues", href: "/issues", ...stats.pipeline.issues },
      { key: "outlines" as const, label: "Outlines", href: "/outlines", ...stats.pipeline.outlines },
    ].map((step) => ({
      ...step,
      needsYou: ny === step.key,
    }));
  }, [stats]);

  return (
    <div
      className="min-h-screen overflow-y-auto px-6 py-7 lg:px-11 lg:pb-14"
      style={{ color: INK, backgroundColor: "#F5EFE4" }}
    >
      {/* Header */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-8">
        <div>
          {stats ? (
            <>
              <p
                className="text-[10px] font-[family-name:var(--font-geist-mono)] uppercase tracking-[0.2em] mb-2"
                style={{ color: SUB }}
              >
                {stats.greeting.dateLine}
              </p>
              <h1 className="font-[family-name:var(--font-instrument-serif)] text-3xl sm:text-4xl tracking-tight leading-tight">
                {stats.greeting.headline}{" "}
                <span style={{ color: ACCENT }}>{stats.greeting.accentPhrase}</span>
              </h1>
            </>
          ) : (
            <h1 className="font-[family-name:var(--font-instrument-serif)] text-3xl tracking-tight">
              {statsError ? "Dashboard" : "Loading…"}
            </h1>
          )}
          {statsError && <p className="mt-2 text-sm" style={{ color: ACCENT }}>{statsError}</p>}
        </div>
        <div className="flex flex-col gap-2 sm:items-end w-full sm:w-auto max-w-md">
          <button
            type="button"
            onClick={openCommandPalette}
            className="flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors hover:opacity-95"
            style={{ borderColor: LINE, backgroundColor: PANEL, boxShadow: CARD_SHADOW }}
          >
            <Search className="h-4 w-4 shrink-0" style={{ color: SUB }} />
            <span className="flex-1 min-w-0 text-sm text-[#9C8E78]">Search workspace…</span>
            <kbd
              className="hidden sm:inline rounded border px-1.5 py-0.5 text-[10px] font-[family-name:var(--font-geist-mono)]"
              style={{ borderColor: LINE, color: SUB }}
            >
              ⌘K
            </kbd>
          </button>
          <Link
            href="/issues"
            className="inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: ACCENT }}
          >
            <Sparkles className="h-4 w-4" />
            New issue
          </Link>
        </div>
      </header>

      {/* Pipeline rail */}
      {stats && (
        <section
          className="rounded-xl border p-4 mb-8 grid grid-cols-2 lg:grid-cols-4 gap-3"
          style={{ borderColor: LINE, backgroundColor: PANEL, boxShadow: CARD_SHADOW }}
        >
          {pipelineSteps.map((step) => (
            <Link
              key={step.key}
              href={step.href}
              className="relative rounded-lg border p-4 transition-colors hover:bg-[#F5EFE4]/80"
              style={{ borderColor: LINE }}
            >
              {step.needsYou && (
                <span
                  className="absolute -top-2 right-2 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-white"
                  style={{ backgroundColor: ACCENT }}
                >
                  Needs you
                </span>
              )}
              <div className="text-[10px] uppercase tracking-widest font-[family-name:var(--font-geist-mono)]" style={{ color: SUB }}>
                {step.label}
              </div>
              <div className="mt-1 text-2xl font-semibold tabular-nums">{step.count}</div>
              <div className="text-xs mt-0.5" style={{ color: SUB }}>
                {step.sublabel}
              </div>
            </Link>
          ))}
        </section>
      )}

      {/* Two-column: ingest + nudge */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-10">
        <section
          className="rounded-xl border p-5"
          style={{ borderColor: LINE, backgroundColor: PANEL, boxShadow: CARD_SHADOW }}
        >
          <div className="flex items-center gap-2 mb-4">
            <Rss className="h-4 w-4" style={{ color: ACCENT }} />
            <h2 className="font-[family-name:var(--font-instrument-serif)] text-xl">Ingest feed</h2>
          </div>
          {stats?.lastIngest && (
            <p className="text-xs mb-3" style={{ color: SUB }}>
              Last ingest: {formatIngestAt(stats.lastIngest.at)}
              {stats.lastIngest.inserted != null && ` · +${stats.lastIngest.inserted} rows`}
              {stats.lastIngest.isStale && (
                <span className="ml-2 font-medium" style={{ color: ACCENT }}>
                  (stale)
                </span>
              )}
            </p>
          )}
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              value={feedUrl}
              onChange={(e) => setFeedUrl(e.target.value)}
              className="flex-1 rounded-lg border px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-[#C8571E]"
              style={{ borderColor: LINE, backgroundColor: "#FFFCF6", color: INK }}
            />
            <button
              type="button"
              onClick={() => void runIngest()}
              disabled={ingestLoading}
              className="inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              style={{ backgroundColor: ACCENT }}
            >
              {ingestLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {ingestLoading ? "Ingesting…" : "Run ingest"}
            </button>
          </div>
          {ingestResult && (
            <p className="mt-3 text-sm font-[family-name:var(--font-geist-mono)]" style={{ color: ingestResult.error ? ACCENT : SUB }}>
              {ingestResult.error
                ? String(ingestResult.error)
                : `+${ingestResult.inserted ?? 0} inserted · ${ingestResult.skipped ?? 0} skipped`}
            </p>
          )}

          <button
            type="button"
            onClick={() => setShowManual((v) => !v)}
            className="mt-5 flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm"
            style={{ borderColor: LINE, color: SUB }}
          >
            <span className="flex items-center gap-2">
              <PenLine className="h-4 w-4" />
              Manual signal
            </span>
            <Plus className={cn("h-4 w-4 transition-transform", showManual && "rotate-45")} />
          </button>
          {showManual && (
            <div className="mt-3 space-y-2">
              <input
                value={manualTitle}
                onChange={(e) => setManualTitle(e.target.value)}
                placeholder="Title (required)"
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                style={{ borderColor: LINE, backgroundColor: "#FFFCF6", color: INK }}
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  value={manualUrl}
                  onChange={(e) => setManualUrl(e.target.value)}
                  placeholder="URL"
                  className="rounded-lg border px-3 py-2 text-sm outline-none"
                  style={{ borderColor: LINE, backgroundColor: "#FFFCF6", color: INK }}
                />
                <input
                  value={manualPublisher}
                  onChange={(e) => setManualPublisher(e.target.value)}
                  placeholder="Publisher"
                  className="rounded-lg border px-3 py-2 text-sm outline-none"
                  style={{ borderColor: LINE, backgroundColor: "#FFFCF6", color: INK }}
                />
              </div>
              <textarea
                value={manualNotes}
                onChange={(e) => setManualNotes(e.target.value)}
                placeholder="Notes"
                rows={2}
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none resize-none"
                style={{ borderColor: LINE, backgroundColor: "#FFFCF6", color: INK }}
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void submitManualSignal()}
                  disabled={manualBusy}
                  className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  style={{ backgroundColor: ACCENT2 }}
                >
                  {manualBusy ? <Loader2 className="h-4 w-4 animate-spin inline" /> : "Add signal"}
                </button>
                {manualMsg && <span className="text-xs" style={{ color: SUB }}>{manualMsg}</span>}
              </div>
            </div>
          )}
        </section>

        {stats && !nudgeHidden && (
          <section
            className="rounded-xl border p-5 flex flex-col justify-between"
            style={{ borderColor: LINE, backgroundColor: PANEL, boxShadow: CARD_SHADOW }}
          >
            <div>
              <h2 className="font-[family-name:var(--font-instrument-serif)] text-xl mb-2">The Cornerstone</h2>
              <p className="text-sm leading-relaxed" style={{ color: SUB }}>
                {stats.nudge.line1}
                <span className="font-semibold" style={{ color: INK }}>
                  {stats.nudge.accentFragment}
                </span>
                {stats.nudge.lineAfterAccent}
              </p>
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-2">
              <Link
                href={stats.nudge.primaryCta.href}
                className="inline-flex rounded-lg px-4 py-2 text-sm font-semibold text-white"
                style={{ backgroundColor: ACCENT }}
              >
                {stats.nudge.primaryCta.label}
              </Link>
              <button
                type="button"
                onClick={snoozeNudge}
                className="rounded-lg border px-4 py-2 text-sm"
                style={{ borderColor: LINE, color: SUB }}
              >
                {stats.nudge.secondaryLabel}
              </button>
            </div>
          </section>
        )}

        {stats && nudgeHidden && (
          <section
            className="rounded-xl border p-5 flex items-center justify-between text-sm"
            style={{ borderColor: LINE, backgroundColor: PANEL, boxShadow: CARD_SHADOW }}
          >
            <span style={{ color: SUB }}>Nudge snoozed until {new Date(snoozeUntil!).toLocaleString()}</span>
            <button
              type="button"
              className="text-xs font-medium underline"
              style={{ color: ACCENT }}
              onClick={() => {
                try {
                  localStorage.removeItem(SNOOZE_KEY);
                } catch {
                  /* ignore */
                }
                setSnoozeUntil(null);
              }}
            >
              Clear
            </button>
          </section>
        )}
      </div>

      {/* Signals */}
      <section>
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-4">
          <h2 className="font-[family-name:var(--font-instrument-serif)] text-2xl">Signals</h2>
          <div className="flex flex-wrap gap-1.5">
            {STUDIO_TOPIC_FILTERS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTopicFilter(t)}
                className="rounded-full px-3 py-1 text-xs font-medium transition-colors"
                style={{
                  backgroundColor: topicFilter === t ? ACCENT : CHIP,
                  color: topicFilter === t ? "#fff" : INK,
                }}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          {filteredSignals.map((s) => {
            const heat = s.heat ?? 40;
            const rowKey = s.id ?? s.url;
            const pState = promoteByKey[rowKey] ?? "idle";
            return (
              <div
                key={rowKey}
                className="group rounded-xl border px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3"
                style={{ borderColor: LINE, backgroundColor: PANEL, boxShadow: CARD_SHADOW }}
              >
                <div className="min-w-0 flex-1">
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm font-medium leading-snug hover:underline inline-flex items-start gap-1"
                    style={{ color: INK }}
                  >
                    <span className="min-w-0">{s.title}</span>
                    <ExternalLink className="h-3.5 w-3.5 shrink-0 mt-0.5 opacity-60" />
                  </a>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs" style={{ color: SUB }}>
                    <span className="font-[family-name:var(--font-geist-mono)]">{s.publisher}</span>
                    <span
                      className="rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide"
                      style={{ backgroundColor: CHIP, color: INK }}
                    >
                      {inferTopicFromTitle(s.title)}
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 w-full max-w-xs rounded-full overflow-hidden" style={{ backgroundColor: LINE }}>
                    <div className="h-full rounded-full transition-all" style={{ width: `${heat}%`, backgroundColor: ACCENT }} />
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center">
                  {pState === "ok" && (
                    <span className="text-xs font-medium" style={{ color: ACCENT2 }}>
                      Added to leads ·{" "}
                      <Link href="/leads" className="underline font-semibold">
                        Open leads
                      </Link>
                    </span>
                  )}
                  {pState === "err" && (
                    <span className="text-xs font-medium" style={{ color: ACCENT }}>
                      Couldn’t promote
                    </span>
                  )}
                  {pState !== "ok" && (
                    <button
                      type="button"
                      onClick={() => void promoteToLead(s)}
                      disabled={pState === "loading"}
                      className="rounded-lg px-3 py-2 text-xs font-semibold text-white disabled:opacity-50 inline-flex items-center gap-1"
                      style={{ backgroundColor: ACCENT2 }}
                    >
                      {pState === "loading" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                      {pState === "err" ? "Retry" : "→ Lead"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {filteredSignals.length === 0 && (
            <p className="text-sm py-8 text-center" style={{ color: SUB }}>
              No signals match this filter.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
