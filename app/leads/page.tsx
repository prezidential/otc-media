"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Sparkles,
  Megaphone,
  Check,
  Loader2,
  Inbox,
  CheckCircle2,
  FileText,
  X,
  CheckCheck,
  XCircle,
  Newspaper,
} from "lucide-react";
import { PageHeader } from "../components/page-header";
import { cn } from "@/lib/utils";
import { studioInner, studioTab, studioTabCountBadge } from "@/lib/studio/inner-classes";

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
type LeadTab = "pending_review" | "approved" | "drafted";

function leadAge(createdAt: string): string {
  const d = Math.floor((Date.now() - new Date(createdAt).getTime()) / (24 * 60 * 60 * 1000));
  if (d <= 0) return "today";
  if (d === 1) return "1d";
  return `${d}d`;
}

export default function LeadsPage() {
  const [brandProfiles, setBrandProfiles] = useState<BrandProfile[]>([]);
  const [selectedBrandProfileId, setSelectedBrandProfileId] = useState<string>("");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [activeTab, setActiveTab] = useState<LeadTab>("pending_review");
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [promoLoading, setPromoLoading] = useState(false);
  const [promo, setPromo] = useState<{ item: { title: string; type: string }; promoText: string } | null>(null);
  const [tabCounts, setTabCounts] = useState<Record<LeadTab, number>>({
    pending_review: 0,
    approved: 0,
    drafted: 0,
  });

  const loadTabCounts = useCallback(async () => {
    const [r1, r2, r3] = await Promise.all([
      fetch("/api/leads/list?status=pending_review"),
      fetch("/api/leads/list?status=approved"),
      fetch("/api/leads/list?status=drafted"),
    ]);
    const parse = async (res: Response) => {
      const t = await res.text();
      try {
        const j = JSON.parse(t) as { leads?: Lead[] };
        return (j.leads ?? []).length;
      } catch {
        return 0;
      }
    };
    const [c1, c2, c3] = await Promise.all([parse(r1), parse(r2), parse(r3)]);
    setTabCounts({ pending_review: c1, approved: c2, drafted: c3 });
  }, []);

  async function loadBrandProfiles() {
    const res = await fetch("/api/brand-profiles/list");
    const text = await res.text();
    let data: { brandProfiles?: BrandProfile[]; defaultBrandProfileId?: string | null } = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = {};
    }
    const list = data.brandProfiles ?? [];
    setBrandProfiles(list);
    if (list.length > 0 && !selectedBrandProfileId) {
      const def = data.defaultBrandProfileId;
      const pick = def && list.some((p) => p.id === def) ? def : list[0].id;
      setSelectedBrandProfileId(pick);
    }
  }

  async function loadLeads(tab?: LeadTab) {
    const status = tab ?? activeTab;
    const res = await fetch(`/api/leads/list?status=${status}`);
    const text = await res.text();
    let data: { leads?: Lead[] } = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = {};
    }
    setLeads(data.leads ?? []);
  }

  function switchTab(tab: LeadTab) {
    setActiveTab(tab);
    void loadLeads(tab);
  }

  async function generateLeads() {
    if (!selectedBrandProfileId) {
      setMessage("Select a brand profile first.");
      return;
    }
    setGenerating(true);
    setMessage(null);
    const start = Date.now();
    try {
      const res = await fetch("/api/leads/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandProfileId: selectedBrandProfileId }),
      });
      const data = await res.json().catch(() => ({}));
      const elapsed = Date.now() - start;
      const minMs = 1800;
      if (elapsed < minMs) await new Promise((r) => setTimeout(r, minMs - elapsed));
      if (data.ok) {
        setMessage(`+${data.leadsInserted ?? 0} leads across ${data.directivesProcessed ?? 0} directives`);
        await loadLeads();
        await loadTabCounts();
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
    if (res.ok) {
      await loadLeads();
      await loadTabCounts();
    }
  }

  async function dismiss(id: string) {
    setLeads((prev) => prev.filter((l) => l.id !== id));
    const res = await fetch("/api/leads/dismiss", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (!res.ok) await loadLeads();
    await loadTabCounts();
  }

  async function bulkApprove() {
    const ids = leads.map((l) => l.id);
    setLeads([]);
    for (const id of ids) {
      await fetch("/api/leads/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
    }
    await loadLeads();
    await loadTabCounts();
  }

  async function bulkDismiss() {
    const ids = leads.map((l) => l.id);
    setLeads([]);
    for (const id of ids) {
      await fetch("/api/leads/dismiss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
    }
    await loadLeads();
    await loadTabCounts();
  }

  useEffect(() => {
    void loadBrandProfiles();
    void loadLeads();
    void loadTabCounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, []);

  return (
    <div className={studioInner.pageRoot}>
      <PageHeader
        variant="studio"
        title="Editorial leads"
        description="Generate angles from research, review with a human gate, then feed approved leads into Issues."
      />

      {tabCounts.pending_review >= 2 && (
        <div
          className="mb-6 rounded-[14px] border border-[#3F6B45]/25 px-4 py-3 text-[13px] text-[#1F1A14]"
          style={{ background: "linear-gradient(135deg, #3F6B4514, #FBF7EE)" }}
        >
          <span className="font-medium text-[#2d5231]">{tabCounts.pending_review} leads pending review</span>
          <span className="text-[#6B5F4E]"> — clear the queue so writers can keep shipping.</span>
        </div>
      )}

      {tabCounts.approved >= 3 && (
        <div className="mb-6 rounded-[14px] border border-[#C8571E]/25 bg-[#C8571E]/08 px-4 py-3 text-[13px] text-[#1F1A14]">
          <span className="font-medium">{tabCounts.approved} approved leads</span>
          <span className="text-[#6B5F4E]"> — enough to generate a newsletter draft.</span>
          <div className="mt-2 flex flex-wrap gap-2">
            <Link href="/issues" className={studioInner.btnPrimary + " !py-1.5 !text-xs"}>
              <Newspaper className="h-3.5 w-3.5" />
              Open Issues
            </Link>
            <Link href="/research" className={studioInner.btnSecondary + " !py-1.5 !text-xs"}>
              Run editor pipeline
            </Link>
          </div>
        </div>
      )}

      <div className={cn(studioInner.card, "mb-6")}>
        <div className={studioInner.sectionLabel}>
          <Sparkles className="h-3.5 w-3.5" />
          Lead generation
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={selectedBrandProfileId}
            onChange={(e) => setSelectedBrandProfileId(e.target.value)}
            className={cn(studioInner.select, "min-w-[200px] flex-1")}
          >
            <option value="">Select brand profile</option>
            {brandProfiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void generateLeads()}
            disabled={generating || !selectedBrandProfileId}
            className={studioInner.btnPrimary}
          >
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {generating ? "Generating…" : "Generate leads"}
          </button>
          <button
            type="button"
            onClick={() => void fetchPromo()}
            disabled={promoLoading || !selectedBrandProfileId}
            className={studioInner.btnSecondary}
          >
            {promoLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Megaphone className="h-4 w-4" />}
            {promoLoading ? "Loading…" : "Get promo"}
          </button>
          {message && (
            <span
              className={cn(
                "font-[family-name:var(--font-geist-mono)] text-[12px]",
                message.startsWith("+") ? "text-[#3F6B45]" : "text-[#C0442A]"
              )}
            >
              {message}
            </span>
          )}
        </div>
      </div>

      {promo && (
        <div className={cn(studioInner.card, "mb-6 border-[#C8571E]/30")}>
          <div className={studioInner.sectionLabel}>
            <Megaphone className="h-3.5 w-3.5" />
            Recommended promo · {promo.item.title} ({promo.item.type})
          </div>
          <div className={cn(studioInner.body, "whitespace-pre-wrap")}>{promo.promoText}</div>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-end gap-0 border-b border-[#E4D9C2]">
        <button type="button" onClick={() => switchTab("pending_review")} className={studioTab(activeTab === "pending_review")}>
          <Inbox className="h-4 w-4" />
          Pending review
          <span className={studioTabCountBadge(activeTab === "pending_review")}>{tabCounts.pending_review}</span>
        </button>
        <button type="button" onClick={() => switchTab("approved")} className={studioTab(activeTab === "approved")}>
          <CheckCircle2 className="h-4 w-4" />
          Approved
          <span className={studioTabCountBadge(activeTab === "approved")}>{tabCounts.approved}</span>
        </button>
        <button type="button" onClick={() => switchTab("drafted")} className={studioTab(activeTab === "drafted")}>
          <FileText className="h-4 w-4" />
          Drafted
          <span className={studioTabCountBadge(activeTab === "drafted")}>{tabCounts.drafted}</span>
        </button>
        {activeTab === "pending_review" && leads.length > 1 && (
          <div className="mb-2 ml-auto flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => void bulkDismiss()} className={studioInner.btnSecondary + " !py-1.5 !text-xs"}>
              <XCircle className="h-3 w-3" />
              Dismiss all
            </button>
            <button type="button" onClick={() => void bulkApprove()} className={studioInner.btnPositive + " !py-1.5 !text-xs"}>
              <CheckCheck className="h-3 w-3" />
              Approve all
            </button>
          </div>
        )}
      </div>

      <div className="space-y-3">
        {leads.map((lead) => (
          <div
            key={lead.id}
            className={cn(
              studioInner.card,
              "grid grid-cols-1 gap-4 md:grid-cols-[auto_1fr_auto] md:items-start md:gap-5",
              activeTab === "approved" && "border-[#3F6B45]/35"
            )}
          >
            <div className="flex items-start gap-2">
              <span
                className="rounded px-2 py-1 font-[family-name:var(--font-geist-mono)] text-[10px] font-semibold uppercase tracking-wide text-[#C8571E]"
                style={{ background: "#C8571E18" }}
              >
                {lead.id.slice(0, 8)}
              </span>
            </div>
            <div className="min-w-0">
              <div className="text-[15px] font-medium leading-snug text-[#1F1A14]">
                {lead.angle}{" "}
                <span className="font-[family-name:var(--font-instrument-serif)] text-[15px] font-normal italic text-[#6B5F4E]">
                  · lens
                </span>
              </div>
              <p className={cn(studioInner.body, "mt-2 line-clamp-3")}>{lead.contrarian_take}</p>
              <div className="mt-2 flex flex-wrap gap-3 font-[family-name:var(--font-geist-mono)] text-[10px] uppercase tracking-[0.14em] text-[#9C8E78]">
                <span>{leadAge(lead.created_at)} old</span>
                <span className="text-[#E4D9C2]">|</span>
                <span>confidence {(lead.confidence_score * 100).toFixed(0)}%</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 md:flex-col md:items-end">
              {activeTab === "pending_review" ? (
                <>
                  <button type="button" onClick={() => dismiss(lead.id)} className={studioInner.btnSecondary + " !text-xs"}>
                    <X className="h-3.5 w-3.5" />
                    Pass
                  </button>
                  <button type="button" onClick={() => approve(lead.id)} className={studioInner.btnPositive + " !text-xs"}>
                    <Check className="h-3.5 w-3.5" />
                    Approve
                  </button>
                </>
              ) : activeTab === "approved" ? (
                <Link href="/issues" className={studioInner.btnInk + " !text-xs"}>
                  → Draft
                </Link>
              ) : (
                <span className={cn(studioInner.tag, studioInner.tagGreen, "!normal-case")}>Used in draft</span>
              )}
            </div>
          </div>
        ))}
        {leads.length === 0 && (
          <div className="flex flex-col items-center justify-center rounded-[14px] border border-dashed border-[#E4D9C2] bg-[#FBF7EE]/80 py-16">
            <Inbox className="mb-3 h-10 w-10 text-[#C8571E]/40" />
            <p className="font-[family-name:var(--font-instrument-serif)] text-xl italic text-[#6B5F4E]">
              {activeTab === "pending_review"
                ? "No leads pending review"
                : activeTab === "approved"
                  ? "No approved leads yet"
                  : "No drafted leads"}
            </p>
            <p className={cn(studioInner.body, "mt-2 max-w-md text-center")}>
              {activeTab === "pending_review"
                ? "Generate leads from the card above to populate this queue."
                : activeTab === "approved"
                  ? "Approve items from Pending review to stage them here."
                  : "Leads appear here after they are used in an issue draft."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
