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
    try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
    const list = data.brandProfiles ?? [];
    setBrandProfiles(list);
    if (list.length > 0 && !selectedBrandProfileId) setSelectedBrandProfileId(list[0].id);
  }

  async function loadLeads() {
    const res = await fetch("/api/leads/list?status=pending_review");
    const text = await res.text();
    let data: { leads?: Lead[] } = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
    setLeads(data.leads ?? []);
  }

  async function generateLeads() {
    if (!selectedBrandProfileId) { setMessage("Select a brand profile first."); return; }
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
    } finally { setGenerating(false); }
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
    } finally { setPromoLoading(false); }
  }

  async function approve(id: string) {
    const res = await fetch("/api/leads/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (res.ok) await loadLeads();
  }

  useEffect(() => { loadBrandProfiles(); loadLeads(); }, []);

  return (
    <div style={{ padding: "32px 40px", maxWidth: 1100 }}>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Editorial Leads</h1>
        <p style={{ color: "var(--muted)", fontSize: 14 }}>Generate, review, and approve editorial leads</p>
      </div>

      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 20, marginBottom: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: "var(--muted)" }}>LEAD GENERATION</div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <select
            value={selectedBrandProfileId}
            onChange={(e) => setSelectedBrandProfileId(e.target.value)}
            style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--background)", color: "var(--foreground)", fontSize: 14 }}
          >
            <option value="">Select brand profile</option>
            {brandProfiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button onClick={generateLeads} disabled={generating || !selectedBrandProfileId}
            style={{ padding: "10px 20px", borderRadius: 8, border: "none", background: "var(--accent)", color: "#fff", fontWeight: 600, fontSize: 14, cursor: generating || !selectedBrandProfileId ? "not-allowed" : "pointer", opacity: generating || !selectedBrandProfileId ? 0.7 : 1 }}>
            {generating ? "Generating..." : "Generate Leads"}
          </button>
          <button onClick={fetchPromo} disabled={promoLoading || !selectedBrandProfileId}
            style={{ padding: "10px 16px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--foreground)", fontSize: 14, cursor: promoLoading || !selectedBrandProfileId ? "not-allowed" : "pointer" }}>
            {promoLoading ? "Loading..." : "Get Promo"}
          </button>
          {message && (
            <span style={{ fontSize: 13, color: message.startsWith("Generated") ? "var(--success)" : "var(--danger)", fontWeight: 500 }}>
              {message}
            </span>
          )}
        </div>
      </div>

      {promo && (
        <div style={{ background: "var(--accent-light)", border: "1px solid var(--accent)", borderRadius: 12, padding: 20, marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: "var(--accent)" }}>
            RECOMMENDED PROMO: {promo.item.title} ({promo.item.type})
          </div>
          <div style={{ whiteSpace: "pre-wrap", fontSize: 14, lineHeight: 1.6 }}>{promo.promoText}</div>
        </div>
      )}

      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--muted)", marginBottom: 12 }}>
        PENDING REVIEW ({leads.length})
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {leads.map((lead) => (
          <div key={lead.id}
            style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 20 }}>
            <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 12 }}>{lead.angle}</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, fontSize: 13, marginBottom: 12 }}>
              <div>
                <span style={{ fontWeight: 600, color: "var(--muted)" }}>Why now: </span>
                <span>{lead.why_now}</span>
              </div>
              <div>
                <span style={{ fontWeight: 600, color: "var(--muted)" }}>Impacts: </span>
                <span>{lead.who_it_impacts}</span>
              </div>
            </div>
            <div style={{ fontSize: 13, whiteSpace: "pre-wrap", marginBottom: 12, lineHeight: 1.5 }}>
              <span style={{ fontWeight: 600, color: "var(--muted)" }}>Contrarian take: </span>
              {lead.contrarian_take}
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{
                  width: 60, height: 6, borderRadius: 3, background: "var(--border)",
                  position: "relative", overflow: "hidden",
                }}>
                  <div style={{
                    width: `${lead.confidence_score * 100}%`, height: "100%", borderRadius: 3,
                    background: lead.confidence_score >= 0.7 ? "var(--success)" : lead.confidence_score >= 0.4 ? "var(--warning)" : "var(--danger)",
                  }} />
                </div>
                <span style={{ fontSize: 12, color: "var(--muted)" }}>
                  {(lead.confidence_score * 100).toFixed(0)}%
                </span>
              </div>
              <button onClick={() => approve(lead.id)}
                style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "var(--success)", color: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
                Approve
              </button>
            </div>
          </div>
        ))}
        {leads.length === 0 && (
          <div style={{ textAlign: "center", padding: 40, color: "var(--muted)", fontSize: 14 }}>
            No leads pending review. Generate leads to get started.
          </div>
        )}
      </div>
    </div>
  );
}
