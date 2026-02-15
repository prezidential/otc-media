"use client";

import { useEffect, useState } from "react";

type Signal = {
  title: string;
  publisher: string;
  url: string;
  published_at: string | null;
  captured_at: string;
};

export default function Home() {
  const [feedUrl, setFeedUrl] = useState("https://www.darkreading.com/rss.xml");
  const [result, setResult] = useState<any>(null);
  const [signals, setSignals] = useState<Signal[]>([]);

  async function ingest() {
    setResult(null);
    const res = await fetch("/api/ingest/rss", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feedUrl, limit: 10 })
    });
    const text = await res.text();
    let data: unknown;
    try {
      data = text ? JSON.parse(text) : { error: res.statusText || "Empty response" };
    } catch {
      data = { error: text || res.statusText || "Invalid response" };
    }
    if (!res.ok) {
      data = { ...(typeof data === "object" && data && !Array.isArray(data) ? data : {}), error: (data as { error?: string })?.error ?? `HTTP ${res.status}` };
    }
    setResult(data);
    await loadSignals();
  }

  async function loadSignals() {
    const res = await fetch("/api/signals/list?limit=25");
    const text = await res.text();
    let data: { signals?: Signal[] } = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = {};
    }
    setSignals(data.signals ?? []);
  }

  useEffect(() => { loadSignals(); }, []);

  return (
    <main style={{ padding: 24, maxWidth: 1100 }}>
      <h1>OTC Media Engine</h1>
      <p>RSS ingest + signals list</p>

      <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
        <input
          value={feedUrl}
          onChange={(e) => setFeedUrl(e.target.value)}
          style={{ flex: 1, padding: 10 }}
        />
        <button onClick={ingest} style={{ padding: "10px 16px" }}>
          Ingest RSS
        </button>
      </div>

      {result && (
        <pre style={{ marginTop: 12, background: "#111", color: "#0f0", padding: 12, overflow: "auto" }}>
          {JSON.stringify(result, null, 2)}
        </pre>
      )}

      <h2 style={{ marginTop: 24 }}>Latest Signals</h2>
      <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
        {signals.map((s, idx) => (
          <a key={idx} href={s.url} target="_blank" rel="noreferrer" style={{
            display: "block",
            padding: 12,
            border: "1px solid #ddd",
            borderRadius: 10,
            textDecoration: "none",
            color: "inherit"
          }}>
            <div style={{ fontWeight: 700 }}>{s.title}</div>
            <div style={{ opacity: 0.8, marginTop: 4 }}>{s.publisher}</div>
            <div style={{ opacity: 0.7, fontSize: 12, marginTop: 4 }}>
              {s.published_at ? `Published: ${new Date(s.published_at).toLocaleString()}` : ""}
            </div>
          </a>
        ))}
      </div>
    </main>
  );
}