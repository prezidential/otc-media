"use client";

import { useEffect, useState } from "react";

type Directive = {
  id: string;
  name: string;
  description: string | null;
  cadence: string;
  active: boolean | null;
};

type Run = {
  run_type: string;
  status: string;
  started_at: string | null;
  finished_at: string | null;
  error_message: string | null;
  output_refs_json: Record<string, unknown> | null;
};

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
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (data.ok) {
        setMessage(`Done: ${data.inserted ?? 0} inserted, ${data.skipped ?? 0} skipped.`);
      } else {
        setMessage(data.error ?? `Error: ${res.status}`);
      }
      await loadRuns();
    } finally {
      setRunning(null);
    }
  }

  useEffect(() => { loadDirectives(); loadRuns(); }, []);

  const cadenceBadge = (cadence: string) => ({
    padding: "2px 8px",
    borderRadius: 20,
    fontSize: 11,
    fontWeight: 600 as const,
    background: cadence === "daily" ? "var(--accent-light)" : "var(--warning-light)",
    color: cadence === "daily" ? "var(--accent)" : "var(--warning)",
  });

  const statusColor = (status: string) =>
    status === "completed" ? "var(--success)" : status === "failed" ? "var(--danger)" : "var(--muted)";

  return (
    <div style={{ padding: "32px 40px", maxWidth: 1100 }}>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Research Console</h1>
        <p style={{ color: "var(--muted)", fontSize: 14 }}>Manage directives and ingest signals from RSS feeds</p>
      </div>

      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          padding: 20,
          marginBottom: 24,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: "var(--muted)" }}>
          INGEST CONTROLS
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={() => runDirectives("all")} disabled={!!running}
            style={{ padding: "10px 20px", borderRadius: 8, border: "none", background: "var(--accent)", color: "#fff", fontWeight: 600, fontSize: 14, cursor: running ? "not-allowed" : "pointer", opacity: running ? 0.7 : 1 }}>
            {running === "all" ? "Running All..." : "Run All Directives"}
          </button>
          <button onClick={() => runDirectives("daily")} disabled={!!running}
            style={{ padding: "10px 16px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--foreground)", fontSize: 14, cursor: running ? "not-allowed" : "pointer" }}>
            {running === "daily" ? "Running..." : "Run Daily"}
          </button>
          <button onClick={() => runDirectives("weekly")} disabled={!!running}
            style={{ padding: "10px 16px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--foreground)", fontSize: 14, cursor: running ? "not-allowed" : "pointer" }}>
            {running === "weekly" ? "Running..." : "Run Weekly"}
          </button>
          {message && (
            <span style={{ fontSize: 13, color: message.startsWith("Done") ? "var(--success)" : "var(--danger)", fontWeight: 500 }}>
              {message}
            </span>
          )}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--muted)", marginBottom: 12 }}>
            DIRECTIVES ({directives.length})
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {directives.map((d) => (
              <div key={d.id}
                style={{
                  padding: "14px 16px",
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{d.name}</span>
                  <span style={cadenceBadge(d.cadence)}>{d.cadence}</span>
                </div>
                {d.description && (
                  <div style={{ fontSize: 13, color: "var(--muted)" }}>{d.description}</div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--muted)", marginBottom: 12 }}>
            RECENT RUNS
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {runs.map((r, i) => (
              <div key={i}
                style={{
                  padding: "12px 16px",
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  fontSize: 13,
                }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontWeight: 600, fontFamily: "var(--font-geist-mono, monospace)", fontSize: 12 }}>
                    {r.run_type}
                  </span>
                  <span style={{ color: statusColor(r.status), fontWeight: 600, fontSize: 12 }}>{r.status}</span>
                </div>
                <div style={{ color: "var(--muted)", fontSize: 12 }}>
                  {r.started_at && new Date(r.started_at).toLocaleString()}
                  {r.finished_at && ` → ${new Date(r.finished_at).toLocaleTimeString()}`}
                </div>
                {r.output_refs_json && typeof r.output_refs_json === "object" && "inserted" in r.output_refs_json && (
                  <div style={{ marginTop: 4, fontSize: 12, color: "var(--success)" }}>
                    +{(r.output_refs_json as { inserted?: number }).inserted ?? 0} inserted, {(r.output_refs_json as { skipped?: number }).skipped ?? 0} skipped
                  </div>
                )}
                {r.error_message && (
                  <div style={{ marginTop: 4, fontSize: 12, color: "var(--danger)" }}>{r.error_message}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
