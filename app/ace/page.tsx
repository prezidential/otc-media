"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Play, RefreshCw, AlertCircle, CheckCircle2, Clock, XCircle, SkipForward } from "lucide-react";
import { PageHeader } from "../components/page-header";
import type { BalanceSummary } from "@/lib/ace/lane-balance";

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
      setMessage(
        `${data.status ?? "unknown"}: ${data.summary ?? data.error ?? JSON.stringify(data)}`
      );
      await load();
    } finally {
      setRunning(false);
    }
  }

  function statusIcon(status: string) {
    if (status === "completed") return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
    if (status === "failed") return <XCircle className="h-4 w-4 text-red-500" />;
    if (status === "awaiting_approval") return <Clock className="h-4 w-4 text-amber-500" />;
    if (status === "skipped") return <SkipForward className="h-4 w-4 text-muted-foreground" />;
    return <AlertCircle className="h-4 w-4 text-muted-foreground" />;
  }

  return (
    <div className="p-6 lg:p-10 max-w-5xl">
      <PageHeader
        title="ACE"
        description="Autonomous Content Engine — pipeline, Telegram approvals, and lane balance."
      />

      <div className="mt-8 flex flex-wrap gap-3">
        <button
          type="button"
          disabled={running || loading}
          onClick={() => void runAceNow(false)}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          Run ACE now
        </button>
        <button
          type="button"
          disabled={running || loading}
          onClick={() => void runAceNow(true)}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground disabled:opacity-50"
        >
          <RefreshCw className="h-4 w-4" />
          Force run (bypass pending + stale guards)
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={() => void load()}
          className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
        >
          Refresh
        </button>
      </div>

      {message && (
        <p className="mt-4 rounded-lg border border-border bg-card px-4 py-3 text-sm text-foreground">{message}</p>
      )}

      <div className="mt-6 rounded-lg border border-border bg-card p-4 text-sm">
        <span className="font-medium text-foreground">Feature flag: </span>
        <span className={aceEnabled ? "text-emerald-600" : "text-muted-foreground"}>
          {aceEnabled ? "ACE_ENABLED=true" : "ACE_ENABLED unset or false — cron skips; manual run still returns skipped until enabled."}
        </span>
      </div>

      {loading ? (
        <div className="mt-10 flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading…
        </div>
      ) : (
        <div className="mt-10 space-y-10">
          <section>
            <h2 className="text-lg font-semibold text-foreground">Last run</h2>
            {lastRun ? (
              <div className="mt-3 flex items-start gap-3 rounded-lg border border-border p-4">
                {statusIcon(lastRun.status)}
                <div>
                  <p className="text-sm font-medium text-foreground capitalize">{lastRun.status.replace(/_/g, " ")}</p>
                  <p className="text-xs text-muted-foreground">
                    {lastRun.run_trigger ?? "—"} · {new Date(lastRun.started_at).toLocaleString()}
                  </p>
                  {lastRun.summary && <p className="mt-2 text-sm text-foreground">{lastRun.summary}</p>}
                  {lastRun.error && <p className="mt-1 text-sm text-red-600">{lastRun.error}</p>}
                  {lastRun.draft_id && (
                    <Link href="/issues" className="mt-2 inline-block text-sm text-primary hover:underline">
                      Open Issues (draft {lastRun.draft_id.slice(0, 8)}…)
                    </Link>
                  )}
                </div>
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">No ACE runs yet.</p>
            )}
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">Approval queue</h2>
            {pending.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">No pending Telegram approvals.</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {pending.map((p) => (
                  <li key={p.id} className="rounded-lg border border-border p-4 text-sm">
                    <p className="font-medium text-foreground">{p.entity_type}</p>
                    <p className="text-xs text-muted-foreground">Expires {new Date(p.expires_at).toLocaleString()}</p>
                    <p className="mt-2 line-clamp-4 text-muted-foreground">{p.preview_text}</p>
                    <Link href="/issues" className="mt-2 inline-block text-primary hover:underline">
                      Open Issues
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">Lane balance (30 days)</h2>
            {!laneBalance || laneBalance.lanes.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                No lanes or drafts yet. Run{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-xs">POST /api/content-lanes/seed</code> after
                applying SQL.
              </p>
            ) : (
              <div className="mt-3 space-y-3">
                <p className="text-sm">
                  Inner ring share:{" "}
                  <span className={laneBalance.innerRingFloorMet ? "text-emerald-600" : "text-amber-600"}>
                    {laneBalance.innerRingPercent}%
                  </span>{" "}
                  {laneBalance.innerRingFloorMet ? "(floor met)" : "(below 50% floor)"}
                </p>
                <ul className="space-y-2">
                  {laneBalance.lanes.map((l) => (
                    <li key={l.laneId} className="flex justify-between rounded border border-border px-3 py-2 text-sm">
                      <span>
                        {l.laneName}{" "}
                        <span className="text-xs text-muted-foreground">({l.ring})</span>
                      </span>
                      <span className="text-muted-foreground">
                        {l.actualLast30Days} / {l.targetPerMonth} target
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">Recent runs</h2>
            <ul className="mt-3 divide-y divide-border rounded-lg border border-border">
              {history.map((h) => (
                <li key={h.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                  {statusIcon(h.status)}
                  <div className="flex-1">
                    <span className="font-medium capitalize">{h.status.replace(/_/g, " ")}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {h.run_trigger ?? "—"} · {new Date(h.started_at).toLocaleString()}
                    </span>
                    {h.summary && <p className="text-xs text-muted-foreground">{h.summary}</p>}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}
