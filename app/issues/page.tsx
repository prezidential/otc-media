"use client";

import { useEffect, useState } from "react";
import { FileText, Copy, CheckCheck, Loader2, Settings2 } from "lucide-react";
import { PageHeader } from "../components/page-header";
import { cn } from "@/lib/utils";

type BrandProfile = { id: string; name: string; created_at: string };

const OUTPUT_MODE_OPTIONS = ["full_issue", "insider_access", "bundle"] as const;
const AUDIENCE_OPTIONS = ["practitioner", "ciso", "board"] as const;
const FOCUS_OPTIONS = ["strategic", "tactical", "architecture"] as const;
const TONE_OPTIONS = ["reflective", "confrontational", "analytical", "strategic"] as const;

type SteeringState = { aggressionLevel: number; audienceLevel: (typeof AUDIENCE_OPTIONS)[number]; focusArea: (typeof FOCUS_OPTIONS)[number]; toneMode: (typeof TONE_OPTIONS)[number]; leadLimit: number };

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
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandProfileId: selectedBrandProfileId, leadLimit: leadLimit >= 1 ? leadLimit : 6, aggressionLevel, audienceLevel, focusArea, toneMode, outputMode }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.ok && data.draft) {
        setDraft(data.draft);
        if (data.insiderDraft != null) setInsiderDraft(data.insiderDraft);
        setMessage(data.stored ? "Draft generated and saved" : data.storeError ? `Generated (not saved): ${data.storeError}` : "Draft generated");
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
    (p) => p.values.aggressionLevel === currentSteering.aggressionLevel && p.values.audienceLevel === currentSteering.audienceLevel &&
      p.values.focusArea === currentSteering.focusArea && p.values.toneMode === currentSteering.toneMode && p.values.leadLimit === currentSteering.leadLimit
  );

  useEffect(() => { loadBrandProfiles(); }, []);

  const selectClass = "rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors";

  return (
    <div className="p-6 lg:p-10 max-w-[1100px]">
      <PageHeader title="Issue Draft" description="Generate newsletter issue drafts from approved leads" />

      <div className="rounded-xl border border-border bg-card p-5 mb-4">
        <div className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground mb-4 flex items-center gap-2">
          <FileText className="h-3.5 w-3.5" />
          Generation
        </div>
        <div className="flex gap-3 items-center flex-wrap">
          <select value={selectedBrandProfileId} onChange={(e) => setSelectedBrandProfileId(e.target.value)} className={selectClass}>
            <option value="">Select brand profile</option>
            {brandProfiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select value={outputMode} onChange={(e) => setOutputMode(e.target.value as (typeof OUTPUT_MODE_OPTIONS)[number])} className={selectClass}>
            {OUTPUT_MODE_OPTIONS.map((o) => <option key={o} value={o}>{o.replace(/_/g, " ")}</option>)}
          </select>
          <button onClick={generateDraft} disabled={generating || !selectedBrandProfileId}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity">
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            {generating ? "Generating..." : "Generate Issue Draft"}
          </button>
          {message && (
            <span className={`text-sm font-mono ${message.startsWith("Draft generated") || message === "Draft generated" ? "text-primary" : "text-danger"}`}>
              {message}
            </span>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5 mb-6">
        <div className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground mb-4 flex items-center gap-2">
          <Settings2 className="h-3.5 w-3.5" />
          Editorial Steering
        </div>
        <div className="flex gap-2 flex-wrap mb-4">
          {PRESETS.map((preset, idx) => (
            <button key={preset.name} onClick={() => applyPreset(preset)}
              className={cn(
                "rounded-full px-4 py-1.5 text-xs font-medium transition-colors",
                activePresetIndex === idx
                  ? "bg-primary/15 text-primary border border-primary/30"
                  : "bg-muted/50 text-muted-foreground border border-transparent hover:bg-accent hover:text-foreground"
              )}>
              {preset.name}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-5 items-center">
          <label className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground font-mono uppercase tracking-wider">Aggression</span>
            <input type="range" min={1} max={5} value={aggressionLevel} onChange={(e) => setAggressionLevel(Number(e.target.value))}
              className="w-20 accent-[oklch(0.72_0.19_155)]" />
            <span className="font-mono font-bold w-4 text-center text-primary">{aggressionLevel}</span>
          </label>
          <label className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground font-mono uppercase tracking-wider">Audience</span>
            <select value={audienceLevel} onChange={(e) => setAudienceLevel(e.target.value as (typeof AUDIENCE_OPTIONS)[number])} className={selectClass + " py-1.5 text-xs"}>
              {AUDIENCE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground font-mono uppercase tracking-wider">Focus</span>
            <select value={focusArea} onChange={(e) => setFocusArea(e.target.value as (typeof FOCUS_OPTIONS)[number])} className={selectClass + " py-1.5 text-xs"}>
              {FOCUS_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground font-mono uppercase tracking-wider">Tone</span>
            <select value={toneMode} onChange={(e) => setToneMode(e.target.value as (typeof TONE_OPTIONS)[number])} className={selectClass + " py-1.5 text-xs"}>
              {TONE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground font-mono uppercase tracking-wider">Leads</span>
            <input type="number" min={1} max={50} value={leadLimit} onChange={(e) => setLeadLimit(Number(e.target.value) || 6)}
              className={selectClass + " py-1.5 text-xs w-14"} />
          </label>
        </div>
      </div>

      {draft && (
        <div className="rounded-xl border border-border bg-card p-5 mb-4">
          <div className="flex items-center justify-between mb-4">
            <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Draft Preview</span>
            <button onClick={() => copyText(draft, setCopied)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
              {copied ? <CheckCheck className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          <pre className="whitespace-pre-wrap font-sans text-sm leading-7 max-h-[500px] overflow-auto text-foreground/90">
            {draft}
          </pre>
        </div>
      )}

      {insiderDraft && (
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between mb-4">
            <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Insider Access</span>
            <button onClick={() => copyText(insiderDraft, setCopiedInsider)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
              {copiedInsider ? <CheckCheck className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
              {copiedInsider ? "Copied!" : "Copy"}
            </button>
          </div>
          <pre className="whitespace-pre-wrap font-sans text-sm leading-7 max-h-[500px] overflow-auto text-foreground/90">
            {insiderDraft}
          </pre>
        </div>
      )}
    </div>
  );
}
