"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FileText, Copy, CheckCheck, Loader2, Settings2, RefreshCw, History, ChevronDown, ChevronUp, Trash2, Brain, Columns2, Code2, Send, ExternalLink, Rocket, Sprout, ListTree, Share2, Download } from "lucide-react";
import { PageHeader } from "../components/page-header";
import { cn } from "@/lib/utils";
import type { PodcastScript } from "@/lib/content-products/podcastScriptTypes";
import { PODCAST_DELIVERY, PODCAST_ENERGY, type PodcastDelivery, type PodcastEnergy } from "@/lib/content-products/podcastScriptOptions";

type SocialSnippets = { x_post: string; linkedin_teaser: string; threads: string };

const SNIPPET_LIMITS = { x_hard: 280, x_target: 260, threads: 500 } as const;

type BrandProfile = { id: string; name: string; created_at: string };
type ContentOutline = { id: string; name: string; kind: string; is_default: boolean; created_at: string };
type DraftSummary = { id: string; content: string; content_json: Record<string, unknown> | null; status?: string; created_at: string };
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
  const [contentOutlines, setContentOutlines] = useState<ContentOutline[]>([]);
  const [selectedNewsletterOutlineId, setSelectedNewsletterOutlineId] = useState<string>("");
  const [selectedInsiderOutlineId, setSelectedInsiderOutlineId] = useState<string>("");
  const [insiderFromCurrentDraft, setInsiderFromCurrentDraft] = useState(false);
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
  const [seedingOutlines, setSeedingOutlines] = useState(false);
  const [outlineSeedMessage, setOutlineSeedMessage] = useState<string | null>(null);

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

  async function loadContentOutlines(opts?: { preferDefaultSelection?: boolean }) {
    const res = await fetch("/api/content-outlines");
    const data = await res.json().catch(() => ({}));
    const list = (data.outlines ?? []) as ContentOutline[];
    setContentOutlines(list);
    const pickDefault = opts?.preferDefaultSelection ?? !selectedNewsletterOutlineId;
    if (pickDefault) {
      const defNews = list.find((o) => o.kind === "newsletter_issue" && o.is_default);
      const defInsider = list.find((o) => o.kind === "insider_access" && o.is_default);
      if (defNews) setSelectedNewsletterOutlineId(defNews.id);
      if (defInsider) setSelectedInsiderOutlineId(defInsider.id);
    }
  }

  async function seedDefaultContentOutlines() {
    setSeedingOutlines(true);
    setOutlineSeedMessage(null);
    try {
      const res = await fetch("/api/content-outlines/seed", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (data.error) {
        setOutlineSeedMessage(data.error);
        return;
      }
      if (data.inserted > 0 && Array.isArray(data.outlines)) {
        setOutlineSeedMessage(`Seeded ${data.inserted} default outline(s).`);
        await loadContentOutlines({ preferDefaultSelection: true });
        const news = data.outlines.find((o: { kind: string }) => o.kind === "newsletter_issue");
        const ins = data.outlines.find((o: { kind: string }) => o.kind === "insider_access");
        if (news?.id) setSelectedNewsletterOutlineId(news.id);
        if (ins?.id) setSelectedInsiderOutlineId(ins.id);
      } else {
        setOutlineSeedMessage(typeof data.message === "string" ? data.message : "No new outlines inserted.");
        await loadContentOutlines();
      }
    } finally {
      setSeedingOutlines(false);
    }
  }

  const [showContentProducts, setShowContentProducts] = useState(false);
  const [productBusy, setProductBusy] = useState<string | null>(null);
  const [snippetsData, setSnippetsData] = useState<SocialSnippets | null>(null);
  const [showRawSnippets, setShowRawSnippets] = useState(false);
  const [copiedSnippetKey, setCopiedSnippetKey] = useState<string | null>(null);
  const [podcastScript, setPodcastScript] = useState<PodcastScript | null>(null);
  const [podcastGrounding, setPodcastGrounding] = useState<{ resolvedCount: number; unmatchedCount: number } | null>(null);
  const [ttsBusy, setTtsBusy] = useState(false);
  const [podcastDelivery, setPodcastDelivery] = useState<PodcastDelivery>("conversational");
  const [podcastEnergy, setPodcastEnergy] = useState<PodcastEnergy>("medium");
  const [podcastCustomDirection, setPodcastCustomDirection] = useState("");
  const [sponsorOut, setSponsorOut] = useState<string>("");

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

  async function updateDraftStatus(id: string, status: string) {
    await fetch("/api/issues/update-status", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    await loadDraftHistory();
  }

  async function runContentProduct(kind: "snippets" | "podcast" | "sponsor") {
    if (!draftId && !contentJson) return;
    setProductBusy(kind);
    setMessage(null);
    try {
      const body: Record<string, unknown> = draftId ? { draftId } : contentJson ? { content_json: contentJson } : {};
      if (kind === "podcast") {
        body.podcastDelivery = podcastDelivery;
        body.podcastEnergy = podcastEnergy;
        const hint = podcastCustomDirection.trim();
        if (hint) body.customDirection = hint;
      }
      const path =
        kind === "snippets"
          ? "/api/content-products/social-snippets"
          : kind === "podcast"
            ? "/api/content-products/podcast-script"
            : "/api/content-products/sponsorship-alignment";
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(data.error ?? `${path} failed`);
        return;
      }
      if (kind === "snippets" && data.snippets) {
        setSnippetsData({
          x_post: typeof data.snippets.x_post === "string" ? data.snippets.x_post : "",
          linkedin_teaser: typeof data.snippets.linkedin_teaser === "string" ? data.snippets.linkedin_teaser : "",
          threads: typeof data.snippets.threads === "string" ? data.snippets.threads : "",
        });
        setCopiedSnippetKey(null);
      } else if (kind === "podcast" && data.script) {
        setPodcastScript(data.script as PodcastScript);
        setPodcastGrounding(
          data.grounding && typeof data.grounding === "object"
            ? {
                resolvedCount: Number(data.grounding.resolvedCount) || 0,
                unmatchedCount: Number(data.grounding.unmatchedCount) || 0,
              }
            : null
        );
      } else if (kind === "sponsor" && data.alignment) {
        setSponsorOut(JSON.stringify(data.alignment, null, 2));
      }
      setMessage(`${kind === "snippets" ? "Social" : kind === "podcast" ? "Podcast script" : "Sponsorship"} ready`);
    } finally {
      setProductBusy(null);
    }
  }

  async function copySnippetToClipboard(label: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedSnippetKey(label);
      setTimeout(() => setCopiedSnippetKey((k) => (k === label ? null : k)), 2000);
    } catch {
      setMessage("Copy failed");
    }
  }

  function copyAllSnippets() {
    if (!snippetsData) return;
    const block = [
      `X\n${snippetsData.x_post}`,
      `LinkedIn\n${snippetsData.linkedin_teaser}`,
      `Threads\n${snippetsData.threads}`,
    ].join("\n\n---\n\n");
    void copySnippetToClipboard("all", block);
  }

  async function downloadPodcastMp3() {
    if (!podcastScript) return;
    setTtsBusy(true);
    setMessage(null);
    try {
      const body: Record<string, unknown> = { script: podcastScript };
      if (draftId) {
        body.persist = true;
        body.draftId = draftId;
        if (podcastGrounding) body.grounding = podcastGrounding;
      }
      const res = await fetch("/api/content-products/podcast-tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setMessage(j.error ?? "ElevenLabs TTS failed");
        return;
      }
      const persistStatus = res.headers.get("X-Podcast-Persist-Status");
      const episodeId = res.headers.get("X-Podcast-Episode-Id");
      const persistErr = res.headers.get("X-Podcast-Persist-Error");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const safe = podcastScript.working_title.replace(/[^\w\s-]+/g, "").trim().slice(0, 48) || "episode";
      a.download = `${safe.replace(/\s+/g, "-")}.mp3`;
      a.click();
      URL.revokeObjectURL(url);
      if (persistStatus === "ok" && episodeId) {
        setMessage(`MP3 downloaded · saved to library (${episodeId.slice(0, 8)}…)`);
      } else if (persistStatus === "failed") {
        setMessage(`MP3 downloaded · library save failed: ${persistErr ?? "unknown"}`);
      }
    } finally {
      setTtsBusy(false);
    }
  }

  function updatePodcastWorkingTitle(value: string) {
    setPodcastScript((prev) => (prev ? { ...prev, working_title: value } : prev));
  }

  function updatePodcastSegment(id: string, patch: { narrator_text?: string; title?: string }) {
    setPodcastScript((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        script_segments: prev.script_segments.map((s) => (s.id === id ? { ...s, ...patch } : s)),
      };
    });
  }

  function updatePodcastOutro(value: string) {
    setPodcastScript((prev) => (prev ? { ...prev, outro_cta: value } : prev));
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
    const sourceDraftIdForInsider =
      outputMode === "insider_access" && insiderFromCurrentDraft && draftId ? draftId : null;
    setGenerating(true); setMessage(null); setDraft(""); setInsiderDraft(""); setDraftId(null); setContentJson(null); setCurationInfo(null);
    try {
      const genBody: Record<string, unknown> = {
        brandProfileId: selectedBrandProfileId,
        leadLimit: leadLimit >= 1 ? leadLimit : 6,
        aggressionLevel,
        audienceLevel,
        focusArea,
        toneMode,
        outputMode,
      };
      if (selectedNewsletterOutlineId) genBody.contentOutlineId = selectedNewsletterOutlineId;
      if ((outputMode === "bundle" || outputMode === "insider_access") && selectedInsiderOutlineId) {
        genBody.insiderContentOutlineId = selectedInsiderOutlineId;
      }
      if (sourceDraftIdForInsider) {
        genBody.sourceDraftId = sourceDraftIdForInsider;
      }
      const res = await fetch("/api/issues/generate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(genBody),
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

  useEffect(() => { loadBrandProfiles(); loadLatestDraft(); loadDraftHistory(); loadPublishStatus(); loadContentOutlines(); }, []);

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
          {(outputMode === "full_issue" || outputMode === "bundle") && (
            <select
              value={selectedNewsletterOutlineId}
              onChange={(e) => setSelectedNewsletterOutlineId(e.target.value)}
              className={selectClass}
              title="Content outline (structure). Use Seed default outlines below if this list is empty."
            >
              <option value="">Newsletter outline (built-in default)</option>
              {contentOutlines.filter((o) => o.kind === "newsletter_issue").map((o) => (
                <option key={o.id} value={o.id}>{o.name}{o.is_default ? " ★" : ""}</option>
              ))}
            </select>
          )}
          {(outputMode === "bundle" || outputMode === "insider_access") && (
            <select
              value={selectedInsiderOutlineId}
              onChange={(e) => setSelectedInsiderOutlineId(e.target.value)}
              className={selectClass}
              title="Insider Access outline"
            >
              <option value="">Insider outline (built-in default)</option>
              {contentOutlines.filter((o) => o.kind === "insider_access").map((o) => (
                <option key={o.id} value={o.id}>{o.name}{o.is_default ? " ★" : ""}</option>
              ))}
            </select>
          )}
          {outputMode === "insider_access" && (
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={insiderFromCurrentDraft}
                onChange={(e) => setInsiderFromCurrentDraft(e.target.checked)}
                className="rounded border-border"
              />
              Insider from saved draft
            </label>
          )}
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
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border pt-4">
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Content outlines</span>
          <span className="text-xs text-muted-foreground">
            {contentOutlines.length === 0
              ? "None in database — app still uses built-in defaults until you seed or add rows."
              : `${contentOutlines.length} outline row(s) in the database`}
          </span>
          <Link
            href="/outlines"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent transition-colors"
          >
            <ListTree className="h-3.5 w-3.5" />
            Manage outlines
          </Link>
          <button
            type="button"
            onClick={() => void seedDefaultContentOutlines()}
            disabled={seedingOutlines}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent disabled:opacity-50 transition-colors"
          >
            {seedingOutlines ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sprout className="h-3.5 w-3.5" />}
            {seedingOutlines ? "Seeding…" : "Seed default outlines"}
          </button>
          {outlineSeedMessage && (
            <span className="text-xs font-mono text-muted-foreground">{outlineSeedMessage}</span>
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
                      <div className="flex items-center gap-2 truncate mr-4">
                        <span className="font-medium truncate">
                          {(d.content_json as Record<string, unknown>)?.title as string || d.content?.slice(0, 60) || "Untitled draft"}
                        </span>
                        {d.status && d.status !== "draft" && (
                          <span className={cn("font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full flex-shrink-0",
                            d.status === "published" ? "bg-primary/15 text-primary" : "bg-success/15 text-success"
                          )}>
                            {d.status}
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(d.created_at).toLocaleString()}
                      </span>
                    </div>
                  </button>
                  {d.status !== "published" && (
                    <button onClick={() => updateDraftStatus(d.id, "published")}
                      className="ml-2 p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors flex-shrink-0"
                      title="Mark as published">
                      <Rocket className="h-3.5 w-3.5" />
                    </button>
                  )}
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

      {(draftId || contentJson) && (
        <div className="rounded-xl border border-border bg-card p-5 mb-4">
          <button
            type="button"
            onClick={() => setShowContentProducts(!showContentProducts)}
            className="flex w-full items-center justify-between text-left">
            <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground flex items-center gap-2">
              <Share2 className="h-3.5 w-3.5" />
              Phase 2 — content products
            </span>
            {showContentProducts ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </button>
          {showContentProducts && (
            <div className="mt-4 space-y-4 pt-2 border-t border-border">
              <p className="text-xs text-muted-foreground">
                Uses the current draft ({draftId ? `id ${draftId.slice(0, 8)}…` : "in-memory JSON"}) plus Claude. Requires saved draft for server-side load unless content_json is present.
              </p>
              <div className="rounded-lg border border-border bg-muted/25 p-3 space-y-2">
                <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Podcast script — delivery</div>
                <p className="text-[11px] text-muted-foreground leading-snug">
                  Tuned for a single TTS voice that should sound like a host, not a narrator reading a doc. Style applies when you click <span className="font-medium text-foreground">Podcast script</span>.
                </p>
                <div className="flex flex-wrap gap-3 items-end">
                  <label className="flex flex-col gap-1 text-[11px]">
                    <span className="text-muted-foreground font-mono uppercase tracking-wider">Style</span>
                    <select
                      value={podcastDelivery}
                      onChange={(e) => setPodcastDelivery(e.target.value as PodcastDelivery)}
                      className={selectClass + " py-1.5 text-xs min-w-[160px]"}>
                      {PODCAST_DELIVERY.map((d) => (
                        <option key={d} value={d}>
                          {d === "conversational" ? "Conversational (Notebook-like)" : d === "deep_dive" ? "Deep dive" : "Narrative arc"}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-[11px]">
                    <span className="text-muted-foreground font-mono uppercase tracking-wider">Energy</span>
                    <select
                      value={podcastEnergy}
                      onChange={(e) => setPodcastEnergy(e.target.value as PodcastEnergy)}
                      className={selectClass + " py-1.5 text-xs min-w-[120px]"}>
                      {PODCAST_ENERGY.map((e) => (
                        <option key={e} value={e}>
                          {e === "relaxed" ? "Relaxed" : e === "medium" ? "Medium" : "High"}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="block text-[11px]">
                  <span className="text-muted-foreground font-mono uppercase tracking-wider block mb-1">Extra direction (optional)</span>
                  <textarea
                    value={podcastCustomDirection}
                    onChange={(e) => setPodcastCustomDirection(e.target.value)}
                    rows={2}
                    placeholder="e.g. More humor · tighter on vendor names · assume CISO listener"
                    className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-xs text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary resize-y min-h-[52px]"
                  />
                </label>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={!!productBusy || (!draftId && !contentJson)}
                  onClick={() => runContentProduct("snippets")}
                  className="rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium hover:bg-accent disabled:opacity-50">
                  {productBusy === "snippets" ? <Loader2 className="h-3.5 w-3.5 inline animate-spin" /> : null} Social snippets
                </button>
                <button
                  type="button"
                  disabled={!!productBusy || (!draftId && !contentJson)}
                  onClick={() => runContentProduct("podcast")}
                  className="rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium hover:bg-accent disabled:opacity-50">
                  {productBusy === "podcast" ? <Loader2 className="h-3.5 w-3.5 inline animate-spin" /> : null} Podcast script
                </button>
                <button
                  type="button"
                  disabled={!!productBusy || (!draftId && !contentJson)}
                  onClick={() => runContentProduct("sponsor")}
                  className="rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium hover:bg-accent disabled:opacity-50">
                  {productBusy === "sponsor" ? <Loader2 className="h-3.5 w-3.5 inline animate-spin" /> : null} Sponsorship alignment
                </button>
              </div>
              {snippetsData && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-[10px] font-mono uppercase text-muted-foreground">Social snippets</div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => copyAllSnippets()}
                        className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] font-medium hover:bg-accent">
                        {copiedSnippetKey === "all" ? <CheckCheck className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                        Copy all
                      </button>
                      <label className="inline-flex cursor-pointer items-center gap-1.5 text-[11px] text-muted-foreground select-none">
                        <input type="checkbox" checked={showRawSnippets} onChange={(e) => setShowRawSnippets(e.target.checked)} className="rounded border-border" />
                        Raw JSON
                      </label>
                    </div>
                  </div>
                  {showRawSnippets && (
                    <pre className="text-[11px] whitespace-pre-wrap rounded-lg border border-border bg-muted/30 p-3 max-h-40 overflow-auto font-mono">
                      {JSON.stringify(snippetsData, null, 2)}
                    </pre>
                  )}
                  <div className="grid gap-3 md:grid-cols-1 lg:grid-cols-3">
                    {(
                      [
                        { key: "x", label: "X", sub: `Target ~${SNIPPET_LIMITS.x_target} chars`, text: snippetsData.x_post, limit: SNIPPET_LIMITS.x_hard },
                        { key: "linkedin", label: "LinkedIn", sub: "2–4 short lines", text: snippetsData.linkedin_teaser, limit: null },
                        { key: "threads", label: "Threads", sub: `≤ ${SNIPPET_LIMITS.threads} chars`, text: snippetsData.threads, limit: SNIPPET_LIMITS.threads },
                      ] as const
                    ).map((row) => {
                      const n = row.text.length;
                      const warn = row.limit != null && n > row.limit;
                      const softWarn = row.key === "x" && n > SNIPPET_LIMITS.x_target && n <= SNIPPET_LIMITS.x_hard;
                      return (
                        <div key={row.key} className="rounded-lg border border-border bg-background p-3 flex flex-col min-h-[120px]">
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div>
                              <div className="text-sm font-semibold text-foreground">{row.label}</div>
                              <div className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider">{row.sub}</div>
                            </div>
                            <button
                              type="button"
                              onClick={() => void copySnippetToClipboard(row.key, row.text)}
                              className="shrink-0 inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium hover:bg-accent"
                              aria-label={`Copy ${row.label}`}>
                              {copiedSnippetKey === row.key ? <CheckCheck className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                            </button>
                          </div>
                          {row.limit != null && (
                            <div className={cn("text-[10px] font-mono mb-1", warn ? "text-danger" : softWarn ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground")}>
                              {n} / {row.limit}
                              {row.key === "x" && ` (target ${SNIPPET_LIMITS.x_target})`}
                            </div>
                          )}
                          <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed flex-1">{row.text || "—"}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {podcastScript && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="text-[10px] font-mono uppercase text-muted-foreground">Podcast script</div>
                      <label className="block">
                        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1 block">Episode title (spoken label / files)</span>
                        <input
                          type="text"
                          value={podcastScript.working_title}
                          onChange={(e) => updatePodcastWorkingTitle(e.target.value)}
                          className="w-full max-w-xl rounded-lg border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                        />
                      </label>
                      {typeof podcastScript.estimated_runtime_minutes === "number" && (
                        <p className="text-xs text-muted-foreground">~{podcastScript.estimated_runtime_minutes} min spoken (estimate — unchanged if you edit length)</p>
                      )}
                      {podcastGrounding && (
                        <p className="text-[11px] text-muted-foreground">
                          Signals resolved: {podcastGrounding.resolvedCount}, unmatched URLs: {podcastGrounding.unmatchedCount}
                        </p>
                      )}
                      <p className="text-[11px] text-muted-foreground leading-snug">
                        Edit any segment below before <span className="font-medium text-foreground">Download MP3</span> — your changes are what gets sent to ElevenLabs (no extra script API call). Click <span className="font-medium text-foreground">Podcast script</span> again to regenerate from the draft.
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={ttsBusy}
                      onClick={() => void downloadPodcastMp3()}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 shrink-0">
                      {ttsBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                      Download MP3 (ElevenLabs)
                    </button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Requires <span className="font-mono">ELEVENLABS_API_KEY</span> and <span className="font-mono">ELEVENLABS_VOICE_ID</span>. With a saved draft and{" "}
                    <span className="font-mono">PODCAST_AUDIO_STORAGE_BUCKET</span>, download also writes <span className="font-mono">podcast_episodes</span> + Storage.
                  </p>
                  <ul className="space-y-3 max-h-[min(70vh,520px)] overflow-auto pr-1">
                    {podcastScript.script_segments.map((seg) => (
                      <li key={seg.id} className="rounded-lg border border-border bg-background p-3 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground shrink-0">Segment</span>
                          <code className="text-[10px] bg-muted px-1.5 py-0.5 rounded">{seg.id}</code>
                        </div>
                        <label className="block">
                          <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1 block">Section label (optional)</span>
                          <input
                            type="text"
                            value={seg.title ?? ""}
                            onChange={(e) => updatePodcastSegment(seg.id, { title: e.target.value })}
                            placeholder={seg.id}
                            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                          />
                        </label>
                        <label className="block">
                          <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1 block">Script (read aloud)</span>
                          <textarea
                            value={seg.narrator_text}
                            onChange={(e) => updatePodcastSegment(seg.id, { narrator_text: e.target.value })}
                            rows={8}
                            className="w-full min-h-[160px] rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground leading-relaxed whitespace-pre-wrap outline-none focus:border-primary focus:ring-1 focus:ring-primary resize-y font-sans"
                          />
                        </label>
                      </li>
                    ))}
                  </ul>
                  <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2">
                    <div className="text-[10px] font-mono uppercase text-muted-foreground">Outro / CTA</div>
                    <textarea
                      value={podcastScript.outro_cta ?? ""}
                      onChange={(e) => updatePodcastOutro(e.target.value)}
                      rows={3}
                      placeholder="Subscribe, next episode tease…"
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary resize-y min-h-[72px]"
                    />
                  </div>
                </div>
              )}
              {sponsorOut && (
                <div>
                  <div className="text-[10px] font-mono uppercase text-muted-foreground mb-1">Sponsorship</div>
                  <pre className="text-xs whitespace-pre-wrap rounded-lg border border-border bg-background p-3 max-h-40 overflow-auto">{sponsorOut}</pre>
                </div>
              )}
            </div>
          )}
        </div>
      )}

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
