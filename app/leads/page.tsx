"use client";

import { useEffect, useState } from "react";
import { Sparkles, Megaphone, Check, Loader2, Inbox, CheckCircle2, FileText, X } from "lucide-react";
import { PageHeader } from "../components/page-header";
import { cn } from "@/lib/utils";

type BrandProfile = { id: string; name: string; created_at: string };
type Lead = { id: string; angle: string; why_now: string; who_it_impacts: string; contrarian_take: string; confidence_score: number; status: string; created_at: string };
type LeadTab = "pending_review" | "approved" | "drafted";

export default function LeadsPage() {
  const [brandProfiles, setBrandProfiles] = useState<BrandProfile[]>([]);
  const [selectedBrandProfileId, setSelectedBrandProfileId] = useState<string>("");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [activeTab, setActiveTab] = useState<LeadTab>("pending_review");
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

  async function loadLeads(tab?: LeadTab) {
    const status = tab ?? activeTab;
    const res = await fetch(`/api/leads/list?status=${status}`);
    const text = await res.text();
    let data: { leads?: Lead[] } = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
    setLeads(data.leads ?? []);
  }

  function switchTab(tab: LeadTab) {
    setActiveTab(tab);
    loadLeads(tab);
  }

  async function generateLeads() {
    if (!selectedBrandProfileId) { setMessage("Select a brand profile first."); return; }
    setGenerating(true); setMessage(null);
    try {
      const res = await fetch("/api/leads/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brandProfileId: selectedBrandProfileId }) });
      const data = await res.json().catch(() => ({}));
      if (data.ok) { setMessage(`+${data.leadsInserted ?? 0} leads across ${data.directivesProcessed ?? 0} directives`); await loadLeads(); }
      else { setMessage(data.error ?? `Error: ${res.status}`); }
    } finally { setGenerating(false); }
  }

  async function fetchPromo() {
    if (!selectedBrandProfileId) return;
    setPromoLoading(true); setPromo(null);
    try {
      const res = await fetch("/api/revenue/recommend", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brandProfileId: selectedBrandProfileId }) });
      const data = await res.json().catch(() => ({}));
      if (data.ok && data.item && data.promoText) setPromo({ item: data.item, promoText: data.promoText });
    } finally { setPromoLoading(false); }
  }

  async function approve(id: string) {
    const res = await fetch("/api/leads/approve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    if (res.ok) await loadLeads();
  }

  async function dismiss(id: string) {
    setLeads((prev) => prev.filter((l) => l.id !== id));
    const res = await fetch("/api/leads/dismiss", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    if (!res.ok) await loadLeads();
  }

  useEffect(() => { loadBrandProfiles(); loadLeads(); }, []);

  const confidenceColor = (score: number) =>
    score >= 0.7 ? "bg-success" : score >= 0.4 ? "bg-warning" : "bg-danger";

  return (
    <div className="p-6 lg:p-10 max-w-[1100px]">
      <PageHeader title="Editorial Leads" description="Generate, review, and approve editorial leads" />

      <div className="rounded-xl border border-border bg-card p-5 mb-6">
        <div className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground mb-4 flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5" />
          Lead Generation
        </div>
        <div className="flex gap-3 items-center flex-wrap">
          <select
            value={selectedBrandProfileId}
            onChange={(e) => setSelectedBrandProfileId(e.target.value)}
            className="rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
          >
            <option value="">Select brand profile</option>
            {brandProfiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button onClick={generateLeads} disabled={generating || !selectedBrandProfileId}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity">
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {generating ? "Generating..." : "Generate Leads"}
          </button>
          <button onClick={fetchPromo} disabled={promoLoading || !selectedBrandProfileId}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground hover:bg-accent disabled:opacity-50 transition-colors">
            {promoLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Megaphone className="h-4 w-4" />}
            {promoLoading ? "Loading..." : "Get Promo"}
          </button>
          {message && (
            <span className={`text-sm font-mono ${message.startsWith("+") ? "text-primary" : "text-danger"}`}>
              {message}
            </span>
          )}
        </div>
      </div>

      {promo && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-5 mb-6">
          <div className="font-mono text-[11px] uppercase tracking-widest text-primary mb-3 flex items-center gap-2">
            <Megaphone className="h-3.5 w-3.5" />
            Recommended Promo: {promo.item.title} ({promo.item.type})
          </div>
          <div className="whitespace-pre-wrap text-sm leading-relaxed">{promo.promoText}</div>
        </div>
      )}

      <div className="flex items-center gap-1 mb-4">
        <button onClick={() => switchTab("pending_review")}
          className={cn(
            "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors",
            activeTab === "pending_review" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground"
          )}>
          <Inbox className="h-4 w-4" />
          Pending Review
        </button>
        <button onClick={() => switchTab("approved")}
          className={cn(
            "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors",
            activeTab === "approved" ? "bg-success/15 text-success" : "text-muted-foreground hover:bg-accent hover:text-foreground"
          )}>
          <CheckCircle2 className="h-4 w-4" />
          Approved
        </button>
        <button onClick={() => switchTab("drafted")}
          className={cn(
            "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors",
            activeTab === "drafted" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground"
          )}>
          <FileText className="h-4 w-4" />
          Drafted
        </button>
        <span className="ml-2 font-mono text-[11px] text-muted-foreground">({leads.length})</span>
      </div>

      <div className="space-y-3">
        {leads.map((lead) => (
          <div key={lead.id} className={cn(
            "rounded-xl border bg-card p-5",
            activeTab === "approved" ? "border-success/20" : "border-border"
          )}>
            <div className="text-sm font-semibold leading-snug mb-3">{lead.angle}</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs mb-3">
              <div>
                <span className="font-mono uppercase tracking-wider text-muted-foreground">Why now </span>
                <span className="text-foreground">{lead.why_now}</span>
              </div>
              <div>
                <span className="font-mono uppercase tracking-wider text-muted-foreground">Impacts </span>
                <span className="text-foreground">{lead.who_it_impacts}</span>
              </div>
            </div>
            <div className="text-xs whitespace-pre-wrap leading-relaxed text-muted-foreground mb-4">
              {lead.contrarian_take}
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="h-1.5 w-16 rounded-full bg-muted overflow-hidden">
                  <div className={`h-full rounded-full ${confidenceColor(lead.confidence_score)}`}
                    style={{ width: `${lead.confidence_score * 100}%` }} />
                </div>
                <span className="font-mono text-[11px] text-muted-foreground">
                  {(lead.confidence_score * 100).toFixed(0)}%
                </span>
              </div>
              {activeTab === "pending_review" ? (
                <div className="flex items-center gap-2">
                  <button onClick={() => dismiss(lead.id)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-danger/10 px-3 py-2 text-xs font-medium text-danger hover:bg-danger/20 transition-colors">
                    <X className="h-3.5 w-3.5" />
                    Dismiss
                  </button>
                  <button onClick={() => approve(lead.id)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-success/15 px-4 py-2 text-xs font-semibold text-success hover:bg-success/25 transition-colors">
                    <Check className="h-3.5 w-3.5" />
                    Approve
                  </button>
                </div>
              ) : activeTab === "approved" ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-success">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Approved
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-primary">
                  <FileText className="h-3.5 w-3.5" />
                  Used in draft
                </span>
              )}
            </div>
          </div>
        ))}
        {leads.length === 0 && (
          <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card py-16 text-muted-foreground">
            <Inbox className="h-10 w-10 mb-3 opacity-40" />
            <span className="text-sm">
              {activeTab === "pending_review" ? "No leads pending review" : activeTab === "approved" ? "No approved leads" : "No drafted leads yet"}
            </span>
            <span className="text-xs mt-1">
              {activeTab === "pending_review" ? "Generate leads to get started" : activeTab === "approved" ? "Approve pending leads to see them here" : "Leads move here after being used in a draft"}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
