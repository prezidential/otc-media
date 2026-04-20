"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, Play, RefreshCw, CheckCircle2, Clock, XCircle, SkipForward, AlertCircle } from "lucide-react";
import { AceRingChart } from "../components/studio-inner/ace-ring-chart";
import type { BalanceSummary } from "@/lib/ace/lane-balance";
import { cn } from "@/lib/utils";

const ACE = {
  bg: "#0F0C08",
  panel: "#181410",
  panelHi: "#211B14",
  border: "#2C2318",
  ink: "#F0E6CF",
  sub: "#7A6A52",
  amber: "#E8A24A",
  green: "#6FAE7F",
  red: "#C0442A",
  blue: "#6A9ECA",
};

type AceRunRow = {
  id: string;
  status: string;
  summary: string | null;
  error: string | null;
  started_at: string;
  completed_at: string | null;
  run_trigger?: string;
  draft_id?: string | null;
};

type PendingApproval = {
  id: string;
  entity_type: string;
  entity_id: string;
  preview_text: string;
  sent_at: string;
  expires_at: string;
};

function statusDot(status: string) {
  if (status === "completed") return ACE.green;
  if (status === "failed") return ACE.red;
  if (status === "skipped") return ACE.sub;
  if (status === "awaiting_approval") return ACE.amber;
  return ACE.blue;
}

export default function AcePage() {
  const [loading, setLoading] = useState(true);
  const [aceEnabled, setAceEnabled] = useState(false);
  const [lastRun, setLastRun] = useState<AceRunRow | null>(null);
  const [pending, setPending] = useState<PendingApproval[]>([]);
  const [history, setHistory] = useState<AceRunRow[]>([]);
  const [laneBalance, setLaneBalance] = useState<BalanceSummary | null>(null);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/ace/dashboard");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(data.error ?? `Error ${res.status}`);
        return;
      }
      setAceEnabled(Boolean(data.aceEnabled));
      setLastRun(data.lastRun ?? null);
      setPending(data.pendingApprovals ?? []);
      setHistory(data.history ?? []);
      setLaneBalance(data.laneBalance ?? null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const ringLanes = useMemo(() => {
    const lanes = laneBalance?.lanes ?? [];
    return lanes.map((l) => ({
      name: l.laneName,
      ring: l.ring,
      current: l.actualLast30Days,
      target: l.targetPerMonth,
    }));
  }, [laneBalance]);

  async function runAceNow(force: boolean) {
    setRunning(true);
    setMessage(null);
    try {
      const res = await fetch("/api/ace/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ forceRerun: force }),
      });
      const data = await res.json().catch(() => ({}));
      setMessage(`${data.status ?? "unknown"}: ${data.summary ?? data.error ?? JSON.stringify(data)}`);
      await load();
    } finally {
      setRunning(false);
    }
  }

  function statusIcon(status: string) {
    if (status === "completed") return <CheckCircle2 className="h-4 w-4" style={{ color: ACE.green }} />;
    if (status === "failed") return <XCircle className="h-4 w-4" style={{ color: ACE.red }} />;
    if (status === "awaiting_approval") return <Clock className="h-4 w-4" style={{ color: ACE.amber }} />;
    if (status === "skipped") return <SkipForward className="h-4 w-4" style={{ color: ACE.sub }} />;
    return <AlertCircle className="h-4 w-4" style={{ color: ACE.sub }} />;
  }

  return (
    <div
      className="relative min-h-full px-6 py-8 lg:px-11 lg:py-10"
      style={{ backgroundColor: ACE.bg, color: ACE.ink }}
    >
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="mb-2 font-[family-name:var(--font-geist-mono)] text-[10px] uppercase tracking-[0.2em]" style={{ color: ACE.sub }}>
            Autonomous Content Engine
          </p>
          <h1 className="font-[family-name:var(--font-instrument-serif)] text-3xl font-normal italic tracking-tight sm:text-4xl">
            ACE
          </h1>
          <p className="mt-2 max-w-xl text-[13px] leading-relaxed" style={{ color: ACE.sub }}>
            Lane balance, Telegram approvals, and orchestrated runs — engine room for the Studio.
          </p>
        </div>
        <div
          className={cn(
            "flex shrink-0 items-center gap-3 rounded-2xl border px-4 py-3",
            aceEnabled && "shadow-[0_0_0_1px_rgba(232,162,74,0.35)]"
          )}
          style={{ background: ACE.panelHi, borderColor: ACE.border }}
        >
          <span className="relative flex h-2.5 w-2.5">
            {running && (
              <span
                className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-50"
                style={{ background: ACE.amber }}
              />
            )}
            <span
              className="relative inline-flex h-2.5 w-2.5 rounded-full"
              style={{ background: running ? ACE.amber : aceEnabled ? ACE.green : ACE.sub }}
            />
          </span>
          <div className="text-left">
            <div className="font-[family-name:var(--font-geist-mono)] text-[10px] uppercase tracking-[0.15em]" style={{ color: ACE.sub }}>
              Status
            </div>
            <div className="text-sm font-medium" style={{ color: ACE.ink }}>
              {running ? "Running…" : aceEnabled ? "LIVE" : "STANDBY"}
            </div>
          </div>
          <div
            className="ml-2 rounded-full border px-2 py-1 font-[family-name:var(--font-geist-mono)] text-[9px] uppercase tracking-wider"
            style={{ borderColor: ACE.border, color: ACE.sub }}
            title="Controlled by ACE_ENABLED env"
          >
            ACE_ENABLED={aceEnabled ? "true" : "false"}
          </div>
        </div>
      </header>

      <div className="relative mb-8 overflow-hidden rounded-2xl border p-5 lg:p-6" style={{ background: ACE.panel, borderColor: ACE.border }}>
        {running && (
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-0.5 animate-pulse"
            style={{ background: `linear-gradient(90deg, transparent, ${ACE.amber}, transparent)` }}
          />
        )}
        <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex flex-col items-center lg:items-start">
            <AceRingChart lanes={ringLanes} animating={running} />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-4 lg:max-w-md">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={running || loading}
                onClick={() => void runAceNow(false)}
                className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[13px] font-medium text-[#1a140c] disabled:opacity-50"
                style={{ background: ACE.amber }}
              >
                {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                Run ACE
              </button>
              <button
                type="button"
                disabled={running || loading}
                onClick={() => void runAceNow(true)}
                className="inline-flex items-center gap-2 rounded-full border px-4 py-2.5 text-[13px] font-medium disabled:opacity-50"
                style={{ borderColor: ACE.border, color: ACE.ink }}
              >
                <RefreshCw className="h-4 w-4" />
                Force
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => void load()}
                className="inline-flex items-center gap-2 rounded-full px-3 py-2.5 text-[13px] disabled:opacity-50"
                style={{ color: ACE.sub }}
              >
                Refresh
              </button>
            </div>
            {message && (
              <p className="rounded-lg border px-3 py-2 text-[13px]" style={{ borderColor: ACE.border, background: ACE.panelHi }}>
                {message}
              </p>
            )}
            <div className="grid grid-cols-3 gap-2">
              {[
                { k: "Last run", v: lastRun ? new Date(lastRun.started_at).toLocaleString() : "—" },
                { k: "Queue", v: String(pending.length) },
                {
                  k: "Inner ring",
                  v:
                    laneBalance && laneBalance.lanes.length > 0
                      ? `${laneBalance.innerRingPercent}%`
                      : "—",
                },
              ].map((cell) => (
                <div key={cell.k} className="rounded-xl border px-2 py-3 text-center" style={{ borderColor: ACE.border, background: ACE.panelHi }}>
                  <div className="font-[family-name:var(--font-geist-mono)] text-[9px] uppercase tracking-wider" style={{ color: ACE.sub }}>
                    {cell.k}
                  </div>
                  <div className="mt-1 text-[11px] font-medium leading-tight" style={{ color: ACE.ink }}>
                    {cell.v}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Lane list */}
      <div className="mb-10 rounded-2xl border p-5" style={{ background: ACE.panel, borderColor: ACE.border }}>
        <div className="mb-4 font-[family-name:var(--font-geist-mono)] text-[10px] uppercase tracking-[0.18em]" style={{ color: ACE.sub }}>
          Lanes (30 days)
        </div>
        {!laneBalance || laneBalance.lanes.length === 0 ? (
          <p className="text-[13px]" style={{ color: ACE.sub }}>
            No lanes yet. Apply SQL then{" "}
            <code className="rounded px-1 py-0.5 text-[11px]" style={{ background: ACE.panelHi }}>
              POST /api/content-lanes/seed
            </code>
            .
          </p>
        ) : (
          <ul className="space-y-3">
            {laneBalance.lanes.map((l) => {
              const pct = l.targetPerMonth > 0 ? Math.min(1, l.actualLast30Days / l.targetPerMonth) : 0;
              return (
                <li key={l.laneId} className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="text-[13px] font-medium">{l.laneName}</span>
                    <span
                      className="rounded px-2 py-0.5 font-[family-name:var(--font-geist-mono)] text-[9px] uppercase tracking-wider"
                      style={{
                        background: ACE.panelHi,
                        border: `1px solid ${ACE.border}`,
                        color: ACE.sub,
                      }}
                    >
                      {l.ring}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 sm:min-w-[200px] sm:flex-1 sm:justify-end">
                    <div className="h-1 min-w-[80px] flex-1 max-w-[160px] overflow-hidden rounded-full sm:max-w-[200px]" style={{ background: ACE.border }}>
                      <div
                        className="h-full rounded-full transition-[width] duration-[1400ms] ease-[cubic-bezier(0.4,0,0.2,1)]"
                        style={{ width: `${pct * 100}%`, background: ACE.amber }}
                      />
                    </div>
                    <span className="shrink-0 font-[family-name:var(--font-geist-mono)] text-[11px] tabular-nums" style={{ color: ACE.sub }}>
                      {l.actualLast30Days}/{l.targetPerMonth}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <section>
          <h2 className="font-[family-name:var(--font-geist-mono)] text-[10px] uppercase tracking-[0.2em]" style={{ color: ACE.sub }}>
            Activity
          </h2>
          {loading ? (
            <div className="mt-4 flex items-center gap-2 text-[13px]" style={{ color: ACE.sub }}>
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : (
            <div className="relative mt-4 pl-5">
              <div className="absolute bottom-2 left-[7px] top-2 w-px" style={{ background: ACE.border }} aria-hidden />
              <ul className="space-y-4">
                {(history.length ? history : lastRun ? [lastRun] : []).slice(0, 12).map((h) => {
                  const c = statusDot(h.status);
                  return (
                    <li key={h.id} className="relative flex gap-3">
                      <span
                        className="relative z-[1] mt-0.5 h-3 w-3 shrink-0 rounded-full"
                        style={{
                          background: c,
                          boxShadow: `0 0 6px ${c}88`,
                        }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-2">
                          <span className="font-[family-name:var(--font-geist-mono)] text-[10px] uppercase tracking-wider" style={{ color: ACE.sub }}>
                            {h.run_trigger ?? "run"}
                          </span>
                          <span className="text-[11px]" style={{ color: ACE.sub }}>
                            {new Date(h.started_at).toLocaleString()}
                          </span>
                        </div>
                        <p className="mt-0.5 text-[13px] capitalize" style={{ color: ACE.ink }}>
                          {h.status.replace(/_/g, " ")}
                        </p>
                        {h.summary && <p className="mt-1 text-[12px] leading-snug" style={{ color: ACE.sub }}>{h.summary}</p>}
                        {h.error && <p className="mt-1 text-[12px]" style={{ color: ACE.red }}>{h.error}</p>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </section>

        <section>
          <h2 className="font-[family-name:var(--font-geist-mono)] text-[10px] uppercase tracking-[0.2em]" style={{ color: ACE.sub }}>
            Telegram approvals
          </h2>
          {pending.length === 0 ? (
            <p className="mt-4 text-[13px]" style={{ color: ACE.sub }}>
              No pending approvals.
            </p>
          ) : (
            <ul className="mt-4 space-y-3">
              {pending.map((p) => (
                <li key={p.id} className="rounded-xl border p-4 text-[13px]" style={{ borderColor: ACE.border, background: ACE.panelHi }}>
                  <p className="font-medium">{p.entity_type}</p>
                  <p className="mt-1 text-[11px]" style={{ color: ACE.sub }}>
                    Expires {new Date(p.expires_at).toLocaleString()}
                  </p>
                  <p className="mt-2 line-clamp-4 text-[12px]" style={{ color: ACE.sub }}>
                    {p.preview_text}
                  </p>
                  <Link href="/issues" className="mt-2 inline-block text-[13px] font-medium hover:underline" style={{ color: ACE.amber }}>
                    Open Issues
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {lastRun?.draft_id && (
        <div className="mt-10 text-center">
          <Link href="/issues" className="text-[13px] font-medium hover:underline" style={{ color: ACE.amber }}>
            Open latest draft in Issues →
          </Link>
        </div>
      )}
    </div>
  );
}
