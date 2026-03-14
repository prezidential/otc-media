"use client";

import { useEffect, useState } from "react";
import { FileText, Copy, CheckCheck, Loader2, Settings2, RefreshCw, History, ChevronDown, ChevronUp, Trash2, Brain, Columns2, Code2, Send, ExternalLink } from "lucide-react";
import { PageHeader } from "../components/page-header";
import { cn } from "@/lib/utils";

type BrandProfile = { id: string; name: string; created_at: string };
type DraftSummary = { id: string; content: string; content_json: Record<string, unknown> | null; created_at: string };
type RegeneratableSection = "title" | "hook" | "deep_dive" | "dojo_checklist";

const SECTION_LABELS: Record<RegeneratableSection, string> = {
  title: "Title",
  hook: "Opening Hook",
  deep_dive: "Deep Dive",
  dojo_checklist: "From the Dojo",
};

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
  const [draftId, setDraftId] = useState<string | null>(null);
  const [contentJson, setContentJson] = useState<Record<string, unknown> | null>(null);
  const [insiderDraft, setInsiderDraft] = useState<string>("");
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedInsider, setCopiedInsider] = useState(false);

  const [draftHistory, setDraftHistory] = useState<DraftSummary[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const [regenSection, setRegenSection] = useState<RegeneratableSection | null>(null);
  const [regenInstruction, setRegenInstruction] = useState("");
  const [regenerating, setRegenerating] = useState(false);
  const [curationInfo, setCurationInfo] = useState<{ leadsUsed: number; leadsAvailable: number; rationale: string } | null>(null);
  const [compareDraft, setCompareDraft] = useState<DraftSummary | null>(null);
  const [beehiivEnabled, setBeehiivEnabled] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<{ ok: boolean; message: string; url?: string } | null>(null);
  const [showHtmlExport, setShowHtmlExport] = useState(false);
  const [exportedHtml, setExportedHtml] = useState<string>("");
  const [copiedHtml, setCopiedHtml] = useState(false);

  async function loadPublishStatus() {
    const res = await fetch("/api/publish/status");
    const data = await res.json().catch(() => ({}));
    setBeehiivEnabled(data.beehiiv === true);
  }

  async function exportHtml() {
    if (!draftId) return;
    const res = await fetch("/api/publish/export-html", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ draftId }),
    });
    const data = await res.json().catch(() => ({}));
    if (data.ok && data.html) {
      setExportedHtml(data.html);
      setShowHtmlExport(true);
    }
  }

  async function publishToBeehiiv() {
    if (!draftId) return;
    setPublishing(true); setPublishResult(null);
    try {
      const res = await fetch("/api/publish/beehiiv", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draftId }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.ok) {
        setPublishResult({ ok: true, message: "Draft pushed to Beehiiv", url: data.beehiiv?.web_url });
      } else {
        setPublishResult({ ok: false, message: data.error ?? "Publish failed" });
      }
    } finally { setPublishing(false); }
  }

  async function loadBrandProfiles() {
    const res = await fetch("/api/brand-profiles/list");
    const text = await res.text();
    let data: { brandProfiles?: BrandProfile[] } = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
    const list = data.brandProfiles ?? [];
    setBrandProfiles(list);
    if (list.length > 0 && !selectedBrandProfileId) setSelectedBrandProfileId(list[0].id);
  }

  async function loadDraftHistory() {
    const res = await fetch("/api/issues/list?limit=10");
    const text = await res.text();
    let data: { drafts?: DraftSummary[] } = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
    setDraftHistory(data.drafts ?? []);
  }

  async function loadLatestDraft() {
    const res = await fetch("/api/issues/latest");
    if (!res.ok) return;
    const data = await res.json().catch(() => ({}));
    if (data.id && data.draft) {
      setDraftId(data.id);
      setDraft(data.draft);
      setContentJson(data.content_json ?? null);
    }
  }

  async function deleteDraft(id: string) {
    const res = await fetch("/api/issues/delete", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (res.ok) {
      if (draftId === id) { setDraftId(null); setDraft(""); setContentJson(null); setCurationInfo(null); }
      await loadDraftHistory();
    }
  }

  function loadDraftFromHistory(d: DraftSummary) {
    setDraftId(d.id);
    setDraft(d.content);
    setContentJson(d.content_json ?? null);
    setInsiderDraft("");
    setShowHistory(false);
    setMessage(null);
  }

  async function generateDraft() {
    if (!selectedBrandProfileId) { setMessage("Select a brand profile first."); return; }
    setGenerating(true); setMessage(null); setDraft(""); setInsiderDraft(""); setDraftId(null); setContentJson(null); setCurationInfo(null);
    try {
      const res = await fetch("/api/issues/generate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandProfileId: selectedBrandProfileId, leadLimit: leadLimit >= 1 ? leadLimit : 6, aggressionLevel, audienceLevel, focusArea, toneMode, outputMode }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.ok && data.draft) {
        setDraft(data.draft);
        if (data.insiderDraft != null) setInsiderDraft(data.insiderDraft);
        if (data.curation) setCurationInfo(data.curation);
        setMessage(data.stored ? "Draft generated and saved" : data.storeError ? `Generated (not saved): ${data.storeError}` : "Draft generated");
        await loadLatestDraft();
        await loadDraftHistory();
      } else { setMessage(data.error ?? `Error: ${res.status}`); }
    } finally { setGenerating(false); }
  }

  async function regenerateSection() {
    if (!draftId || !regenSection) return;
    setRegenerating(true); setMessage(null);
    try {
      const res = await fetch("/api/issues/regenerate-section", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draftId, section: regenSection, instruction: regenInstruction }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.ok && data.draft) {
        setDraft(data.draft);
        setContentJson(data.content_json ?? null);
        setMessage(`"${SECTION_LABELS[regenSection]}" regenerated`);
        setRegenSection(null);
        setRegenInstruction("");
      } else {
        setMessage(data.error ?? `Regen failed: ${res.status}`);
      }
    } finally { setRegenerating(false); }
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

  useEffect(() => { loadBrandProfiles(); loadLatestDraft(); loadDraftHistory(); loadPublishStatus(); }, []);

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
          <button onClick={() => { setShowHistory(!showHistory); if (!showHistory) loadDraftHistory(); }}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground hover:bg-accent transition-colors">
            <History className="h-4 w-4" />
            History
            {showHistory ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
          {message && (
            <span className={`text-sm font-mono ${message.includes("generated") || message.includes("regenerated") ? "text-primary" : "text-danger"}`}>
              {message}
            </span>
          )}
        </div>
      </div>

      {showHistory && (
        <div className="rounded-xl border border-border bg-card p-5 mb-4">
          <div className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
            <History className="h-3.5 w-3.5" />
            Draft History
          </div>
          {draftHistory.length === 0 ? (
            <div className="text-sm text-muted-foreground py-4 text-center">No drafts yet</div>
          ) : (
            <div className="space-y-2">
              {draftHistory.map((d) => (
                <div key={d.id}
                  className={cn(
                    "flex items-center rounded-lg border px-4 py-3 text-sm transition-colors",
                    d.id === draftId ? "border-primary/50 bg-primary/5" : "border-border hover:bg-accent"
                  )}>
                  <button onClick={() => loadDraftFromHistory(d)} className="flex-1 text-left min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="font-medium truncate mr-4">
                        {(d.content_json as Record<string, unknown>)?.title as string || d.content?.slice(0, 60) || "Untitled draft"}
                      </span>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(d.created_at).toLocaleString()}
                      </span>
                    </div>
                  </button>
                  {draft && d.id !== draftId && (
                    <button onClick={() => setCompareDraft(compareDraft?.id === d.id ? null : d)}
                      className={cn("ml-2 p-1.5 rounded-md transition-colors flex-shrink-0",
                        compareDraft?.id === d.id ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-primary hover:bg-primary/10"
                      )}
                      title="Compare with current draft">
                      <Columns2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button onClick={() => deleteDraft(d.id)}
                    className="ml-1 p-1.5 rounded-md text-muted-foreground hover:text-danger hover:bg-danger/10 transition-colors flex-shrink-0"
                    title="Delete draft">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

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
            <input type="range" min={1} max={5} value={aggressionLevel} onChange={(e) => setAggressionLevel(Number(e.target.value))} className="w-20 accent-[oklch(0.72_0.19_155)]" />
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
            <span className="text-muted-foreground font-mono uppercase tracking-wider">Max Leads</span>
            <input type="number" min={3} max={20} value={leadLimit} onChange={(e) => setLeadLimit(Number(e.target.value) || 8)} className={selectClass + " py-1.5 text-xs w-14"} />
          </label>
        </div>
      </div>

      {curationInfo && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 mb-4">
          <div className="font-mono text-[11px] uppercase tracking-widest text-primary mb-2 flex items-center gap-2">
            <Brain className="h-3.5 w-3.5" />
            Editor Agent Curation
          </div>
          <div className="text-sm text-foreground/80">{curationInfo.rationale}</div>
          <div className="mt-2 font-mono text-xs text-muted-foreground">
            Selected {curationInfo.leadsUsed} of {curationInfo.leadsAvailable} approved leads
          </div>
        </div>
      )}

      {draft && (
        <div className="rounded-xl border border-border bg-card p-5 mb-4">
          <div className="flex items-center justify-between mb-4">
            <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Draft Preview</span>
            <div className="flex items-center gap-2">
              {draftId && (
                <div className="relative">
                  <button
                    onClick={() => setRegenSection(regenSection ? null : "title")}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
                    <RefreshCw className="h-3.5 w-3.5" />
                    Regenerate Section
                  </button>
                </div>
              )}
              <button onClick={() => copyText(draft, setCopied)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
                {copied ? <CheckCheck className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copied!" : "Copy"}
              </button>
              {draftId && (
                <button onClick={exportHtml}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
                  <Code2 className="h-3.5 w-3.5" />
                  Export HTML
                </button>
              )}
              {draftId && beehiivEnabled && (
                <button onClick={publishToBeehiiv} disabled={publishing}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity">
                  {publishing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  {publishing ? "Pushing..." : "Push to Beehiiv"}
                </button>
              )}
            </div>
          </div>

          {regenSection && draftId && (
            <div className="mb-4 rounded-lg border border-primary/30 bg-primary/5 p-4">
              <div className="flex items-center gap-3 mb-3 flex-wrap">
                <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Section:</span>
                {(Object.keys(SECTION_LABELS) as RegeneratableSection[]).map((s) => (
                  <button key={s} onClick={() => setRegenSection(s)}
                    className={cn(
                      "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                      regenSection === s ? "bg-primary text-primary-foreground" : "bg-muted/50 text-muted-foreground hover:bg-accent"
                    )}>
                    {SECTION_LABELS[s]}
                  </button>
                ))}
              </div>
              <div className="flex gap-3">
                <input
                  value={regenInstruction}
                  onChange={(e) => setRegenInstruction(e.target.value)}
                  placeholder="Optional instruction (e.g. 'Make it more aggressive')"
                  className="flex-1 rounded-lg border border-border bg-background px-4 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary"
                />
                <button onClick={regenerateSection} disabled={regenerating}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity whitespace-nowrap">
                  {regenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  {regenerating ? "Regenerating..." : `Regenerate ${SECTION_LABELS[regenSection]}`}
                </button>
              </div>
            </div>
          )}

          {publishResult && (
            <div className={`mb-4 rounded-lg px-4 py-3 text-sm ${publishResult.ok ? "bg-primary/10 text-primary" : "bg-danger/10 text-danger"}`}>
              <div className="flex items-center gap-2">
                <span>{publishResult.message}</span>
                {publishResult.url && (
                  <a href={publishResult.url} target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-1 underline">
                    Open in Beehiiv <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </div>
          )}

          {showHtmlExport && exportedHtml && (
            <div className="mb-4 rounded-lg border border-border bg-background p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Newsletter HTML</span>
                <div className="flex items-center gap-2">
                  <button onClick={() => copyText(exportedHtml, setCopiedHtml)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
                    {copiedHtml ? <CheckCheck className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
                    {copiedHtml ? "Copied!" : "Copy HTML"}
                  </button>
                  <button onClick={() => setShowHtmlExport(false)}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                    Close
                  </button>
                </div>
              </div>
              <pre className="whitespace-pre-wrap font-mono text-xs leading-5 max-h-[300px] overflow-auto text-muted-foreground">
                {exportedHtml}
              </pre>
            </div>
          )}

          <pre className="whitespace-pre-wrap font-sans text-sm leading-7 max-h-[500px] overflow-auto text-foreground/90">
            {draft}
          </pre>
        </div>
      )}

      {compareDraft && draft && (
        <div className="rounded-xl border border-primary/20 bg-card p-5 mb-4">
          <div className="flex items-center justify-between mb-4">
            <div className="font-mono text-[11px] uppercase tracking-widest text-primary flex items-center gap-2">
              <Columns2 className="h-3.5 w-3.5" />
              Draft Comparison
            </div>
            <button onClick={() => setCompareDraft(null)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              Close
            </button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
                Current — {(contentJson as Record<string, unknown>)?.title as string || "Current Draft"}
              </div>
              <pre className="whitespace-pre-wrap font-sans text-xs leading-6 max-h-[400px] overflow-auto text-foreground/80 rounded-lg border border-border bg-background p-3">
                {draft}
              </pre>
            </div>
            <div>
              <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
                Comparing — {(compareDraft.content_json as Record<string, unknown>)?.title as string || new Date(compareDraft.created_at).toLocaleDateString()}
              </div>
              <pre className="whitespace-pre-wrap font-sans text-xs leading-6 max-h-[400px] overflow-auto text-foreground/80 rounded-lg border border-border bg-background p-3">
                {compareDraft.content}
              </pre>
            </div>
          </div>
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
