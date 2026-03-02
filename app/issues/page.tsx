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
    setInsiderDraft("");
    try {
      const res = await fetch("/api/issues/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandProfileId: selectedBrandProfileId,
          leadLimit: leadLimit >= 1 ? leadLimit : 6,
          aggressionLevel,
          audienceLevel,
          focusArea,
          toneMode,
          outputMode,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.ok && data.draft) {
        setDraft(data.draft);
        if (data.insiderDraft != null) setInsiderDraft(data.insiderDraft);
        setMessage(
          data.stored
            ? "Draft generated and saved."
            : data.storeError
              ? `Draft generated (not saved): ${data.storeError}`
              : "Draft generated (not saved: table may be missing)."
        );
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

  function copyInsiderDraft() {
    if (!insiderDraft) return;
    navigator.clipboard.writeText(insiderDraft).then(() => {
      setCopiedInsider(true);
      setTimeout(() => setCopiedInsider(false), 2000);
    });
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
    (p) =>
      p.values.aggressionLevel === currentSteering.aggressionLevel &&
      p.values.audienceLevel === currentSteering.audienceLevel &&
      p.values.focusArea === currentSteering.focusArea &&
      p.values.toneMode === currentSteering.toneMode &&
      p.values.leadLimit === currentSteering.leadLimit
  );

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
        <label style={{ marginRight: 8, marginLeft: 12 }}>Output mode:</label>
        <select
          value={outputMode}
          onChange={(e) => setOutputMode(e.target.value as (typeof OUTPUT_MODE_OPTIONS)[number])}
          style={{
            padding: "8px 12px",
            marginRight: 12,
            background: theme.bg,
            color: theme.fg,
            border: theme.border,
            borderRadius: 4,
          }}
        >
          {OUTPUT_MODE_OPTIONS.map((o) => (
            <option key={o} value={o}>{o.replace(/_/g, " ")}</option>
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

      <div style={{ marginTop: 16 }}>
        <span style={{ fontSize: 12, opacity: 0.85, marginRight: 8 }}>Presets:</span>
        {PRESETS.map((preset, idx) => (
          <button
            key={preset.name}
            type="button"
            onClick={() => applyPreset(preset)}
            style={{
              marginRight: 8,
              marginTop: 4,
              padding: "6px 12px",
              cursor: "pointer",
              background: activePresetIndex === idx ? "var(--foreground)" : theme.bg,
              color: activePresetIndex === idx ? "var(--background)" : theme.fg,
              border: theme.border,
              borderRadius: 4,
            }}
          >
            {preset.name}
          </button>
        ))}
      </div>

      <div style={{ marginTop: 16, display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span>Aggression: {aggressionLevel}</span>
          <input
            type="range"
            min={1}
            max={5}
            value={aggressionLevel}
            onChange={(e) => setAggressionLevel(Number(e.target.value))}
            style={{ width: 80 }}
          />
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span>Audience:</span>
          <select
            value={audienceLevel}
            onChange={(e) => setAudienceLevel(e.target.value as (typeof AUDIENCE_OPTIONS)[number])}
            style={{ padding: "6px 10px", background: theme.bg, color: theme.fg, border: theme.border, borderRadius: 4 }}
          >
            {AUDIENCE_OPTIONS.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span>Focus:</span>
          <select
            value={focusArea}
            onChange={(e) => setFocusArea(e.target.value as (typeof FOCUS_OPTIONS)[number])}
            style={{ padding: "6px 10px", background: theme.bg, color: theme.fg, border: theme.border, borderRadius: 4 }}
          >
            {FOCUS_OPTIONS.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span>Tone:</span>
          <select
            value={toneMode}
            onChange={(e) => setToneMode(e.target.value as (typeof TONE_OPTIONS)[number])}
            style={{ padding: "6px 10px", background: theme.bg, color: theme.fg, border: theme.border, borderRadius: 4 }}
          >
            {TONE_OPTIONS.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span>Lead limit:</span>
          <input
            type="number"
            min={1}
            max={50}
            value={leadLimit}
            onChange={(e) => setLeadLimit(Number(e.target.value) || 6)}
            style={{ padding: "6px 10px", width: 56, background: theme.bg, color: theme.fg, border: theme.border, borderRadius: 4 }}
          />
        </label>
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
              {copied ? "Copied" : "Copy Draft"}
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

      {insiderDraft && (
        <div style={{ marginTop: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <strong>Insider Access</strong>
            <button
              type="button"
              onClick={copyInsiderDraft}
              style={{
                padding: "6px 12px",
                cursor: "pointer",
                background: theme.bg,
                color: theme.fg,
                border: theme.border,
                borderRadius: 4,
              }}
            >
              {copiedInsider ? "Copied" : "Copy Insider Draft"}
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
            {insiderDraft}
          </pre>
        </div>
      )}
    </main>
  );
}
