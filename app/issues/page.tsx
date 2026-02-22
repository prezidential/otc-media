"use client";

import { useEffect, useState } from "react";

type BrandProfile = { id: string; name: string; created_at: string };

export default function IssuesPage() {
  const [brandProfiles, setBrandProfiles] = useState<BrandProfile[]>([]);
  const [selectedBrandProfileId, setSelectedBrandProfileId] = useState<string>("");
  const [draft, setDraft] = useState<string>("");
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function loadBrandProfiles() {
    const res = await fetch("/api/brand-profiles/list");
    const text = await res.text();
    let data: { brandProfiles?: BrandProfile[] } = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = {};
    }
    const list = data.brandProfiles ?? [];
    setBrandProfiles(list);
    if (list.length > 0 && !selectedBrandProfileId) setSelectedBrandProfileId(list[0].id);
  }

  async function generateDraft() {
    if (!selectedBrandProfileId) {
      setMessage("Select a brand profile first.");
      return;
    }
    setGenerating(true);
    setMessage(null);
    setDraft("");
    try {
      const res = await fetch("/api/issues/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandProfileId: selectedBrandProfileId, leadLimit: 6 }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.ok && data.draft) {
        setDraft(data.draft);
        setMessage(data.stored ? "Draft generated and saved." : "Draft generated (not saved: table may be missing).");
      } else {
        setMessage(data.error ?? `Error: ${res.status}`);
      }
    } finally {
      setGenerating(false);
    }
  }

  function copyDraft() {
    if (!draft) return;
    navigator.clipboard.writeText(draft).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  useEffect(() => {
    loadBrandProfiles();
  }, []);

  const theme = {
    bg: "var(--background)",
    fg: "var(--foreground)",
    border: "1px solid var(--foreground)",
  };

  return (
    <main style={{ padding: 24, maxWidth: 900, color: theme.fg }}>
      <h1>Issue Draft</h1>

      <div style={{ marginTop: 24 }}>
        <label style={{ marginRight: 8 }}>Brand profile:</label>
        <select
          value={selectedBrandProfileId}
          onChange={(e) => setSelectedBrandProfileId(e.target.value)}
          style={{
            padding: "8px 12px",
            marginRight: 12,
            background: theme.bg,
            color: theme.fg,
            border: theme.border,
            borderRadius: 4,
          }}
        >
          <option value="">— Select —</option>
          {brandProfiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={generateDraft}
          disabled={generating || !selectedBrandProfileId}
          style={{
            padding: "10px 16px",
            cursor: generating || !selectedBrandProfileId ? "not-allowed" : "pointer",
            background: theme.bg,
            color: theme.fg,
            border: theme.border,
            borderRadius: 4,
          }}
        >
          {generating ? "Generating…" : "Generate Issue Draft"}
        </button>
        {message && <span style={{ marginLeft: 12 }}>{message}</span>}
      </div>

      {draft && (
        <div style={{ marginTop: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <strong>Preview</strong>
            <button
              type="button"
              onClick={copyDraft}
              style={{
                padding: "6px 12px",
                cursor: "pointer",
                background: theme.bg,
                color: theme.fg,
                border: theme.border,
                borderRadius: 4,
              }}
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <pre
            style={{
              padding: 16,
              border: theme.border,
              borderRadius: 8,
              background: theme.bg,
              whiteSpace: "pre-wrap",
              fontFamily: "inherit",
              fontSize: 14,
              maxHeight: 480,
              overflow: "auto",
            }}
          >
            {draft}
          </pre>
        </div>
      )}
    </main>
  );
}
