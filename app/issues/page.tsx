"use client";

import { useEffect, useState } from "react";

type BrandProfile = { id: string; name: string; created_at: string };

const OUTPUT_MODE_OPTIONS = ["full_issue", "insider_access", "bundle"] as const;
const AUDIENCE_OPTIONS = ["practitioner", "ciso", "board"] as const;
const FOCUS_OPTIONS = ["strategic", "tactical", "architecture"] as const;
const TONE_OPTIONS = ["reflective", "confrontational", "analytical", "strategic"] as const;

type SteeringState = {
  aggressionLevel: number;
  audienceLevel: (typeof AUDIENCE_OPTIONS)[number];
  focusArea: (typeof FOCUS_OPTIONS)[number];
  toneMode: (typeof TONE_OPTIONS)[number];
  leadLimit: number;
};

const PRESETS: { name: string; values: SteeringState }[] = [
  { name: "CISO Aggressive", values: { aggressionLevel: 5, audienceLevel: "ciso", focusArea: "strategic", toneMode: "confrontational", leadLimit: 6 } },
  { name: "Board Brief", values: { aggressionLevel: 4, audienceLevel: "board", focusArea: "strategic", toneMode: "strategic", leadLimit: 4 } },
  { name: "Practitioner Tactical", values: { aggressionLevel: 3, audienceLevel: "practitioner", focusArea: "tactical", toneMode: "analytical", leadLimit: 6 } },
  { name: "Reflective Operator", values: { aggressionLevel: 3, audienceLevel: "practitioner", focusArea: "architecture", toneMode: "reflective", leadLimit: 6 } },
];

export default function IssuesPage() {
  const [brandProfiles, setBrandProfiles] = useState<BrandProfile[]>([]);
  const [selectedBrandProfileId, setSelectedBrandProfileId] = useState<string>("");
  const [aggressionLevel, setAggressionLevel] = useState(3);
  const [audienceLevel, setAudienceLevel] = useState<(typeof AUDIENCE_OPTIONS)[number]>("practitioner");
  const [focusArea, setFocusArea] = useState<(typeof FOCUS_OPTIONS)[number]>("architecture");
  const [toneMode, setToneMode] = useState<(typeof TONE_OPTIONS)[number]>("strategic");
  const [leadLimit, setLeadLimit] = useState(6);
  const [outputMode, setOutputMode] = useState<(typeof OUTPUT_MODE_OPTIONS)[number]>("full_issue");
  const [draft, setDraft] = useState<string>("");
  const [insiderDraft, setInsiderDraft] = useState<string>("");
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedInsider, setCopiedInsider] = useState(false);

  async function loadBrandProfiles() {
    const res = await fetch("/api/brand-profiles/list");
    const text = await res.text();
    let data: { brandProfiles?: BrandProfile[] } = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
    const list = data.brandProfiles ?? [];
    setBrandProfiles(list);
    if (list.length > 0 && !selectedBrandProfileId) setSelectedBrandProfileId(list[0].id);
  }

  async function generateDraft() {
    if (!selectedBrandProfileId) { setMessage("Select a brand profile first."); return; }
    setGenerating(true); setMessage(null); setDraft(""); setInsiderDraft("");
    try {
      const res = await fetch("/api/issues/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandProfileId: selectedBrandProfileId, leadLimit: leadLimit >= 1 ? leadLimit : 6, aggressionLevel, audienceLevel, focusArea, toneMode, outputMode }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.ok && data.draft) {
        setDraft(data.draft);
        if (data.insiderDraft != null) setInsiderDraft(data.insiderDraft);
        setMessage(data.stored ? "Draft generated and saved." : data.storeError ? `Draft generated (not saved): ${data.storeError}` : "Draft generated.");
      } else { setMessage(data.error ?? `Error: ${res.status}`); }
    } finally { setGenerating(false); }
  }

  function copyText(text: string, setter: (v: boolean) => void) {
    navigator.clipboard.writeText(text).then(() => { setter(true); setTimeout(() => setter(false), 2000); });
  }

  function applyPreset(preset: (typeof PRESETS)[number]) {
    setAggressionLevel(preset.values.aggressionLevel);
    setAudienceLevel(preset.values.audienceLevel);
    setFocusArea(preset.values.focusArea);
    setToneMode(preset.values.toneMode);
    setLeadLimit(preset.values.leadLimit);
  }

  const currentSteering: SteeringState = { aggressionLevel, audienceLevel, focusArea, toneMode, leadLimit };
  const activePresetIndex = PRESETS.findIndex(
    (p) => p.values.aggressionLevel === currentSteering.aggressionLevel &&
      p.values.audienceLevel === currentSteering.audienceLevel &&
      p.values.focusArea === currentSteering.focusArea &&
      p.values.toneMode === currentSteering.toneMode &&
      p.values.leadLimit === currentSteering.leadLimit
  );

  useEffect(() => { loadBrandProfiles(); }, []);

  const selectStyle = {
    padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)",
    background: "var(--background)", color: "var(--foreground)", fontSize: 13,
  };

  return (
    <div style={{ padding: "32px 40px", maxWidth: 1100 }}>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Issue Draft</h1>
        <p style={{ color: "var(--muted)", fontSize: 14 }}>Generate newsletter issue drafts from approved leads</p>
      </div>

      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 20, marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: "var(--muted)" }}>GENERATION</div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <select value={selectedBrandProfileId} onChange={(e) => setSelectedBrandProfileId(e.target.value)} style={selectStyle}>
            <option value="">Select brand profile</option>
            {brandProfiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select value={outputMode} onChange={(e) => setOutputMode(e.target.value as (typeof OUTPUT_MODE_OPTIONS)[number])} style={selectStyle}>
            {OUTPUT_MODE_OPTIONS.map((o) => <option key={o} value={o}>{o.replace(/_/g, " ")}</option>)}
          </select>
          <button onClick={generateDraft} disabled={generating || !selectedBrandProfileId}
            style={{ padding: "10px 20px", borderRadius: 8, border: "none", background: "var(--accent)", color: "#fff", fontWeight: 600, fontSize: 14, cursor: generating || !selectedBrandProfileId ? "not-allowed" : "pointer", opacity: generating || !selectedBrandProfileId ? 0.7 : 1 }}>
            {generating ? "Generating..." : "Generate Issue Draft"}
          </button>
          {message && (
            <span style={{ fontSize: 13, color: message.startsWith("Draft generated") ? "var(--success)" : "var(--danger)", fontWeight: 500 }}>
              {message}
            </span>
          )}
        </div>
      </div>

      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 20, marginBottom: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: "var(--muted)" }}>EDITORIAL STEERING</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
          {PRESETS.map((preset, idx) => (
            <button key={preset.name} onClick={() => applyPreset(preset)}
              style={{
                padding: "6px 14px", borderRadius: 20, fontSize: 13, fontWeight: 500, cursor: "pointer",
                border: activePresetIndex === idx ? "1px solid var(--accent)" : "1px solid var(--border)",
                background: activePresetIndex === idx ? "var(--accent-light)" : "var(--surface)",
                color: activePresetIndex === idx ? "var(--accent)" : "var(--foreground)",
              }}>
              {preset.name}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <span style={{ color: "var(--muted)" }}>Aggression</span>
            <input type="range" min={1} max={5} value={aggressionLevel} onChange={(e) => setAggressionLevel(Number(e.target.value))} style={{ width: 80 }} />
            <span style={{ fontWeight: 600, minWidth: 12 }}>{aggressionLevel}</span>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
            <span style={{ color: "var(--muted)" }}>Audience</span>
            <select value={audienceLevel} onChange={(e) => setAudienceLevel(e.target.value as (typeof AUDIENCE_OPTIONS)[number])} style={selectStyle}>
              {AUDIENCE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
            <span style={{ color: "var(--muted)" }}>Focus</span>
            <select value={focusArea} onChange={(e) => setFocusArea(e.target.value as (typeof FOCUS_OPTIONS)[number])} style={selectStyle}>
              {FOCUS_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
            <span style={{ color: "var(--muted)" }}>Tone</span>
            <select value={toneMode} onChange={(e) => setToneMode(e.target.value as (typeof TONE_OPTIONS)[number])} style={selectStyle}>
              {TONE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
            <span style={{ color: "var(--muted)" }}>Lead limit</span>
            <input type="number" min={1} max={50} value={leadLimit} onChange={(e) => setLeadLimit(Number(e.target.value) || 6)}
              style={{ ...selectStyle, width: 56 }} />
          </label>
        </div>
      </div>

      {draft && (
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 20, marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--muted)" }}>DRAFT PREVIEW</span>
            <button onClick={() => copyText(draft, setCopied)}
              style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--foreground)", fontSize: 12, cursor: "pointer" }}>
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          <pre style={{ whiteSpace: "pre-wrap", fontFamily: "var(--font-geist-sans, system-ui)", fontSize: 14, lineHeight: 1.7, maxHeight: 500, overflow: "auto", margin: 0 }}>
            {draft}
          </pre>
        </div>
      )}

      {insiderDraft && (
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--muted)" }}>INSIDER ACCESS</span>
            <button onClick={() => copyText(insiderDraft, setCopiedInsider)}
              style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--foreground)", fontSize: 12, cursor: "pointer" }}>
              {copiedInsider ? "Copied!" : "Copy"}
            </button>
          </div>
          <pre style={{ whiteSpace: "pre-wrap", fontFamily: "var(--font-geist-sans, system-ui)", fontSize: 14, lineHeight: 1.7, maxHeight: 500, overflow: "auto", margin: 0 }}>
            {insiderDraft}
          </pre>
        </div>
      )}
    </div>
  );
}
