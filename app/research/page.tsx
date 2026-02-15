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
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function loadDirectives() {
    const res = await fetch("/api/research/list-directives");
    const text = await res.text();
    let data: { directives?: Directive[] } = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = {};
    }
    setDirectives(data.directives ?? []);
  }

  async function loadRuns() {
    const res = await fetch("/api/runs/list?limit=25");
    const text = await res.text();
    let data: { runs?: Run[] } = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = {};
    }
    setRuns(data.runs ?? []);
  }

  async function runDailyDirectives() {
    setRunning(true);
    setMessage(null);
    try {
      const res = await fetch("/api/research/run-directives", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cadence: "daily", limitPerFeed: 10 }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.ok) {
        setMessage(`Done: ${data.inserted ?? 0} inserted, ${data.skipped ?? 0} skipped.`);
      } else {
        setMessage(data.error ?? `Error: ${res.status}`);
      }
      await loadRuns();
    } finally {
      setRunning(false);
    }
  }

  useEffect(() => {
    loadDirectives();
    loadRuns();
  }, []);

  return (
    <main style={{ padding: 24, maxWidth: 900 }}>
      <h1>Research Console</h1>

      <div style={{ marginTop: 24 }}>
        <button
          type="button"
          onClick={runDailyDirectives}
          disabled={running}
          style={{ padding: "10px 16px", cursor: running ? "not-allowed" : "pointer" }}
        >
          {running ? "Running…" : "Run Daily Directives"}
        </button>
        {message && <span style={{ marginLeft: 12 }}>{message}</span>}
      </div>

      <h2 style={{ marginTop: 32 }}>Directives</h2>
      <ul style={{ listStyle: "none", padding: 0, marginTop: 8 }}>
        {directives.map((d) => (
          <li
            key={d.id}
            style={{
              padding: 12,
              marginBottom: 8,
              border: "1px solid #ddd",
              borderRadius: 8,
              backgroundColor: d.active === false ? "#f5f5f5" : undefined,
            }}
          >
            <strong>{d.name}</strong>
            <span style={{ marginLeft: 8, color: "#666" }}>({d.cadence})</span>
            {d.description && (
              <div style={{ marginTop: 6, fontSize: 14, color: "#444" }}>{d.description}</div>
            )}
          </li>
        ))}
      </ul>

      <h2 style={{ marginTop: 32 }}>Recent Runs</h2>
      <ul style={{ listStyle: "none", padding: 0, marginTop: 8 }}>
        {runs.map((r, i) => (
          <li
            key={i}
            style={{
              padding: 12,
              marginBottom: 8,
              border: "1px solid #ddd",
              borderRadius: 8,
              fontSize: 14,
            }}
          >
            <span style={{ fontWeight: 600 }}>{r.run_type}</span>
            <span style={{ marginLeft: 8, color: r.status === "completed" ? "green" : r.status === "failed" ? "red" : "#666" }}>
              {r.status}
            </span>
            {r.started_at && (
              <span style={{ marginLeft: 8, color: "#666" }}>
                started {new Date(r.started_at).toLocaleString()}
              </span>
            )}
            {r.finished_at && (
              <span style={{ marginLeft: 8, color: "#666" }}>
                finished {new Date(r.finished_at).toLocaleString()}
              </span>
            )}
            {r.error_message && (
              <div style={{ marginTop: 6, color: "red" }}>{r.error_message}</div>
            )}
            {r.output_refs_json && typeof r.output_refs_json === "object" && "inserted" in r.output_refs_json && (
              <div style={{ marginTop: 6, color: "#444" }}>
                inserted: {(r.output_refs_json as { inserted?: number }).inserted ?? 0},{" "}
                skipped: {(r.output_refs_json as { skipped?: number }).skipped ?? 0}
              </div>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
