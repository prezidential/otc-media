"use client";

import { useEffect, useState } from "react";

type BrandProfile = { id: string; name: string; created_at: string };

type Lead = {
  id: string;
  angle: string;
  why_now: string;
  who_it_impacts: string;
  contrarian_take: string;
  confidence_score: number;
  status: string;
  created_at: string;
};

export default function LeadsPage() {
  const [brandProfiles, setBrandProfiles] = useState<BrandProfile[]>([]);
  const [selectedBrandProfileId, setSelectedBrandProfileId] = useState<string>("");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [promoLoading, setPromoLoading] = useState(false);
  const [promo, setPromo] = useState<{ item: { title: string; type: string }; promoText: string } | null>(null);

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

  async function loadLeads() {
    const res = await fetch("/api/leads/list?status=pending_review");
    const text = await res.text();
    let data: { leads?: Lead[] } = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = {};
    }
    setLeads(data.leads ?? []);
  }

  async function generateLeads() {
    if (!selectedBrandProfileId) {
      setMessage("Select a brand profile first.");
      return;
    }
    setGenerating(true);
    setMessage(null);
    try {
      const res = await fetch("/api/leads/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandProfileId: selectedBrandProfileId }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.ok) {
        setMessage(`Generated ${data.leadsInserted ?? 0} leads across ${data.directivesProcessed ?? 0} directives.`);
        await loadLeads();
      } else {
        setMessage(data.error ?? `Error: ${res.status}`);
      }
    } finally {
      setGenerating(false);
    }
  }

  async function fetchPromo() {
    if (!selectedBrandProfileId) return;
    setPromoLoading(true);
    setPromo(null);
    try {
      const res = await fetch("/api/revenue/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandProfileId: selectedBrandProfileId }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.ok && data.item && data.promoText) setPromo({ item: data.item, promoText: data.promoText });
    } finally {
      setPromoLoading(false);
    }
  }

  async function approve(id: string) {
    const res = await fetch("/api/leads/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (res.ok) await loadLeads();
  }

  useEffect(() => {
    loadBrandProfiles();
    loadLeads();
  }, []);

  const theme = {
    bg: "var(--background)",
    fg: "var(--foreground)",
    border: "1px solid var(--foreground)",
  };

  return (
    <main style={{ padding: 24, maxWidth: 900, color: theme.fg }}>
      <h1>Editorial Leads</h1>

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
          onClick={generateLeads}
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
          {generating ? "Generating…" : "Generate Leads"}
        </button>
        {message && <span style={{ marginLeft: 12 }}>{message}</span>}
      </div>

      <div style={{ marginTop: 24 }}>
        <button
          type="button"
          onClick={fetchPromo}
          disabled={promoLoading || !selectedBrandProfileId}
          style={{
            padding: "8px 14px",
            cursor: promoLoading || !selectedBrandProfileId ? "not-allowed" : "pointer",
            background: theme.bg,
            color: theme.fg,
            border: theme.border,
            borderRadius: 4,
          }}
        >
          {promoLoading ? "Loading…" : "Get recommended promo"}
        </button>
        {promo && (
          <div
            style={{
              marginTop: 12,
              padding: 16,
              border: theme.border,
              borderRadius: 8,
              background: theme.bg,
              whiteSpace: "pre-wrap",
              fontSize: 14,
            }}
          >
            <div style={{ marginBottom: 8, opacity: 0.85 }}>
              {promo.item.title} ({promo.item.type})
            </div>
            {promo.promoText}
          </div>
        )}
      </div>

      <h2 style={{ marginTop: 32 }}>Pending review</h2>
      <ul style={{ listStyle: "none", padding: 0, marginTop: 8 }}>
        {leads.map((lead) => (
          <li
            key={lead.id}
            style={{
              padding: 16,
              marginBottom: 12,
              border: theme.border,
              borderRadius: 8,
              background: theme.bg,
            }}
          >
            <div style={{ marginBottom: 8 }}>
              <strong>Angle:</strong> {lead.angle}
            </div>
            <div style={{ marginBottom: 8 }}>
              <strong>Why now:</strong> {lead.why_now}
            </div>
            <div style={{ marginBottom: 8 }}>
              <strong>Who it impacts:</strong> {lead.who_it_impacts}
            </div>
            <div style={{ marginBottom: 8, whiteSpace: "pre-wrap" }}>
              <strong>Contrarian take:</strong> {lead.contrarian_take}
            </div>
            <div style={{ marginBottom: 8, fontSize: 14, opacity: 0.85 }}>
              Confidence: {(lead.confidence_score * 100).toFixed(0)}%
            </div>
            <button
              type="button"
              onClick={() => approve(lead.id)}
              style={{
                padding: "6px 12px",
                cursor: "pointer",
                background: theme.bg,
                color: theme.fg,
                border: theme.border,
                borderRadius: 4,
              }}
            >
              Approve
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}
