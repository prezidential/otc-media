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
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(false);

  async function ingest() {
    setResult(null);
    setLoading(true);
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
      await loadSignals();
    } finally {
      setLoading(false);
    }
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

  useEffect(() => {
    loadSignals();
  }, []);

  return (
    <div style={{ padding: "32px 40px", maxWidth: 1100 }}>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Signals</h1>
        <p style={{ color: "var(--muted)", fontSize: 14 }}>Ingest RSS feeds and browse captured signals</p>
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
          RSS FEED INGEST
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <input
            value={feedUrl}
            onChange={(e) => setFeedUrl(e.target.value)}
            placeholder="Enter RSS feed URL..."
            style={{
              flex: 1,
              padding: "10px 14px",
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "var(--background)",
              color: "var(--foreground)",
              fontSize: 14,
              outline: "none",
            }}
          />
          <button
            onClick={ingest}
            disabled={loading}
            style={{
              padding: "10px 20px",
              borderRadius: 8,
              border: "none",
              background: "var(--accent)",
              color: "#fff",
              fontWeight: 600,
              fontSize: 14,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.7 : 1,
              whiteSpace: "nowrap",
            }}
          >
            {loading ? "Ingesting..." : "Ingest Feed"}
          </button>
        </div>

        {result && (
          <div
            style={{
              marginTop: 12,
              padding: 12,
              borderRadius: 8,
              background: (result as Record<string, unknown>).error ? "var(--danger-light)" : "var(--success-light)",
              color: (result as Record<string, unknown>).error ? "var(--danger)" : "var(--success)",
              fontSize: 13,
              fontFamily: "var(--font-geist-mono, monospace)",
            }}
          >
            {(result as Record<string, unknown>).error
              ? `Error: ${(result as Record<string, unknown>).error}`
              : `Inserted: ${(result as Record<string, unknown>).inserted ?? 0}, Skipped: ${(result as Record<string, unknown>).skipped ?? 0}`}
          </div>
        )}
      </div>

      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--muted)", marginBottom: 12 }}>
        LATEST SIGNALS ({signals.length})
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {signals.map((s, idx) => (
          <a
            key={idx}
            href={s.url}
            target="_blank"
            rel="noreferrer"
            style={{
              display: "block",
              padding: "14px 18px",
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 10,
              textDecoration: "none",
              color: "inherit",
              transition: "border-color 0.15s, box-shadow 0.15s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "var(--accent)";
              e.currentTarget.style.boxShadow = "0 0 0 1px var(--accent)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "var(--border)";
              e.currentTarget.style.boxShadow = "none";
            }}
          >
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{s.title}</div>
            <div style={{ display: "flex", gap: 12, fontSize: 12, color: "var(--muted)" }}>
              <span>{s.publisher}</span>
              {s.published_at && (
                <span>{new Date(s.published_at).toLocaleDateString()}</span>
              )}
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
