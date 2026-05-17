"use client";

import { useCallback, useEffect, useState, type KeyboardEvent } from "react";
import { Plus, X, Loader2, Check, Rss, ExternalLink, Save, Wand2 } from "lucide-react";
import { studioInner } from "@/lib/studio/inner-classes";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type ResearchIntent = {
  topic_focus: string[];
  watch_entities: string[];
  keywords: string[];
};

type ResearchSource = {
  id: string;
  name: string;
  feed_url: string;
  site_url: string | null;
  status: "proposed" | "approved" | "rejected";
  proposed_by: "agent" | "user";
  trust_score: number;
  last_ingested_at: string | null;
  created_at: string;
};

// ─── Tag list input ───────────────────────────────────────────────────────────

function TagListInput({
  items,
  onChange,
  placeholder,
}: {
  items: string[];
  onChange: (items: string[]) => void;
  placeholder?: string;
}) {
  const [input, setInput] = useState("");

  function addItem() {
    const trimmed = input.trim();
    if (trimmed) {
      onChange([...items, trimmed]);
      setInput("");
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      addItem();
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          className={cn(studioInner.input, "flex-1")}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder ?? "Type and press Enter"}
        />
        <button type="button" onClick={addItem} className={studioInner.btnSecondary}>
          <Plus className="h-3.5 w-3.5" />
          Add
        </button>
      </div>
      {items.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {items.map((item, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 rounded-full border border-[#E4D9C2] bg-[#F5EFE4] px-2.5 py-1 text-[12px] text-[#1F1A14]"
            >
              {item}
              <button
                type="button"
                onClick={() => onChange(items.filter((_, j) => j !== i))}
                className="ml-0.5 text-[#9C8E78] hover:text-[#C8571E] transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Research Intent form ─────────────────────────────────────────────────────

function ResearchIntentForm() {
  const [intent, setIntent] = useState<ResearchIntent>({
    topic_focus: [],
    watch_entities: [],
    keywords: [],
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/research-intent");
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.intent) setIntent(data.intent as ResearchIntent);
      setLoading(false);
    })();
  }, []);

  async function save() {
    setSaving(true);
    setError("");
    setSaved(false);
    const res = await fetch("/api/research-intent", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(intent),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setError(typeof data.error === "string" ? data.error : "Save failed");
      return;
    }
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2500);
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-[#6B5F4E]">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading…
      </div>
    );
  }

  return (
    <div className={cn(studioInner.card, "space-y-5")}>
      <div className="flex items-center justify-between">
        <div>
          <div className={studioInner.sectionLabel}>Research intent</div>
          <p className="text-[12px] text-[#9C8E78]">
            Tell the Researcher Agent what you care about. It uses this to find and score signals.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className={studioInner.btnPrimary}
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : saved ? (
            <Check className="h-4 w-4" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {saving ? "Saving…" : saved ? "Saved" : "Save"}
        </button>
      </div>

      {error && (
        <div className="rounded-[10px] border border-[#C0442A]/35 bg-[#C0442A]/08 px-4 py-3 text-sm text-[#8B2E1F]">
          {error}
        </div>
      )}

      <div>
        <label className={cn(studioInner.sectionLabel, "mb-1.5 block")}>Topic focus</label>
        <p className="text-[11px] text-[#9C8E78] mb-2">
          The subjects this publication covers, e.g. "identity security", "IAM", "non-human identities"
        </p>
        <TagListInput
          items={intent.topic_focus}
          onChange={(v) => setIntent((p) => ({ ...p, topic_focus: v }))}
          placeholder="e.g. identity security"
        />
      </div>

      <div>
        <label className={cn(studioInner.sectionLabel, "mb-1.5 block")}>Entities to watch</label>
        <p className="text-[11px] text-[#9C8E78] mb-2">
          Companies, products, agencies, or people to track, e.g. "Okta", "CrowdStrike", "CISA"
        </p>
        <TagListInput
          items={intent.watch_entities}
          onChange={(v) => setIntent((p) => ({ ...p, watch_entities: v }))}
          placeholder="e.g. Okta"
        />
      </div>

      <div>
        <label className={cn(studioInner.sectionLabel, "mb-1.5 block")}>Keywords</label>
        <p className="text-[11px] text-[#9C8E78] mb-2">
          Specific terms to monitor across all sources, e.g. "ITDR", "zero trust", "CIEM"
        </p>
        <TagListInput
          items={intent.keywords}
          onChange={(v) => setIntent((p) => ({ ...p, keywords: v }))}
          placeholder="e.g. zero trust"
        />
      </div>
    </div>
  );
}

// ─── Add source form ──────────────────────────────────────────────────────────

function AddSourceForm({ onAdded }: { onAdded: () => void }) {
  const [name, setName] = useState("");
  const [feedUrl, setFeedUrl] = useState("");
  const [siteUrl, setSiteUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (!name.trim() || !feedUrl.trim()) {
      setError("Name and feed URL are required.");
      return;
    }
    setSubmitting(true);
    setError("");
    const res = await fetch("/api/research-sources/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        feed_url: feedUrl.trim(),
        site_url: siteUrl.trim() || null,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setSubmitting(false);
    if (!res.ok) {
      setError(typeof data.error === "string" ? data.error : "Failed to add source");
      return;
    }
    setName("");
    setFeedUrl("");
    setSiteUrl("");
    onAdded();
  }

  return (
    <div className={cn(studioInner.card, "space-y-3")}>
      <div className={studioInner.sectionLabel}>
        <Rss className="h-3.5 w-3.5" />
        Add a source
      </div>
      <p className="text-[12px] text-[#9C8E78] -mt-1">
        Sources you add are auto-approved and available for the next ingest run.
      </p>

      {error && (
        <div className="rounded-[10px] border border-[#C0442A]/35 bg-[#C0442A]/08 px-4 py-3 text-sm text-[#8B2E1F]">
          {error}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={cn(studioInner.sectionLabel, "mb-1 block")}>Publication name *</label>
          <input
            className={cn(studioInner.input, "w-full")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Dark Reading"
          />
        </div>
        <div>
          <label className={cn(studioInner.sectionLabel, "mb-1 block")}>RSS / Atom feed URL *</label>
          <input
            className={cn(studioInner.input, "w-full")}
            value={feedUrl}
            onChange={(e) => setFeedUrl(e.target.value)}
            placeholder="https://example.com/feed.xml"
          />
        </div>
        <div className="sm:col-span-2">
          <label className={cn(studioInner.sectionLabel, "mb-1 block")}>Site URL (optional)</label>
          <input
            className={cn(studioInner.input, "w-full")}
            value={siteUrl}
            onChange={(e) => setSiteUrl(e.target.value)}
            placeholder="https://example.com"
          />
        </div>
      </div>

      <button
        type="button"
        onClick={() => void submit()}
        disabled={submitting}
        className={studioInner.btnPrimary}
      >
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        {submitting ? "Adding…" : "Add source"}
      </button>
    </div>
  );
}

// ─── Source card ──────────────────────────────────────────────────────────────

function SourceCard({
  source,
  onApprove,
  onReject,
}: {
  source: ResearchSource;
  onApprove?: () => void;
  onReject?: () => void;
}) {
  const [acting, setActing] = useState<"approve" | "reject" | null>(null);

  async function act(action: "approve" | "reject") {
    setActing(action);
    await fetch(`/api/research-sources/${encodeURIComponent(source.id)}/${action}`, {
      method: "POST",
    });
    setActing(null);
    action === "approve" ? onApprove?.() : onReject?.();
  }

  const isProposed = source.status === "proposed";

  return (
    <div
      className={cn(
        "rounded-[14px] border bg-[#FBF7EE] px-4 py-3 shadow-[0_1px_0_rgba(30,20,10,0.04)]",
        isProposed ? "border-[#C8571E]/30" : "border-[#E4D9C2]"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 mb-0.5">
            <span className="text-[13px] font-semibold text-[#1F1A14]">{source.name}</span>
            {isProposed && (
              <span className={cn(studioInner.tag, studioInner.tagOrange)}>Proposed by agent</span>
            )}
            {source.status === "approved" && (
              <span className={cn(studioInner.tag, studioInner.tagGreen)}>Approved</span>
            )}
          </div>
          <a
            href={source.feed_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-[family-name:var(--font-geist-mono)] text-[11px] text-[#9C8E78] hover:text-[#C8571E] transition-colors"
          >
            {source.feed_url.replace(/^https?:\/\//, "").slice(0, 60)}
            <ExternalLink className="h-3 w-3" />
          </a>
          {source.last_ingested_at && (
            <div className="mt-1 text-[11px] text-[#9C8E78]">
              Last ingested: {new Date(source.last_ingested_at).toLocaleDateString()}
            </div>
          )}
        </div>

        {isProposed && (
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => void act("approve")}
              disabled={acting !== null}
              className={cn(studioInner.btnPositive, "!px-3 !py-1.5 !text-[12px]")}
            >
              {acting === "approve" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
              Approve
            </button>
            <button
              type="button"
              onClick={() => void act("reject")}
              disabled={acting !== null}
              className={cn(studioInner.btnSecondary, "!px-3 !py-1.5 !text-[12px]")}
            >
              {acting === "reject" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <X className="h-3.5 w-3.5" />
              )}
              Reject
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Sources list ─────────────────────────────────────────────────────────────

function SourcesList({ refreshKey }: { refreshKey: number }) {
  const [proposed, setProposed] = useState<ResearchSource[]>([]);
  const [approved, setApproved] = useState<ResearchSource[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/research-sources/list");
    const data = await res.json().catch(() => ({ sources: [] }));
    const all = (data.sources ?? []) as ResearchSource[];
    setProposed(all.filter((s) => s.status === "proposed"));
    setApproved(all.filter((s) => s.status === "approved"));
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-[#6B5F4E]">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading sources…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {proposed.length > 0 && (
        <div>
          <div className={cn(studioInner.sectionLabel, "mb-3")}>
            Proposed sources ({proposed.length})
          </div>
          <div className="space-y-2">
            {proposed.map((s) => (
              <SourceCard
                key={s.id}
                source={s}
                onApprove={() => void load()}
                onReject={() => void load()}
              />
            ))}
          </div>
        </div>
      )}

      <div>
        <div className={cn(studioInner.sectionLabel, "mb-3")}>
          Approved sources ({approved.length})
        </div>
        {approved.length === 0 ? (
          <p className="text-[13px] text-[#9C8E78]">
            No approved sources yet — add one above or wait for the agent to propose sources based
            on your Research Intent.
          </p>
        ) : (
          <div className="space-y-2">
            {approved.map((s) => (
              <SourceCard key={s.id} source={s} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Seed directives panel ────────────────────────────────────────────────────

function SeedDirectivesPanel() {
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "already" | "err">("idle");

  async function seed() {
    setStatus("loading");
    try {
      const res = await fetch("/api/research/seed-directives", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setStatus("err"); return; }
      setStatus(data.inserted === 0 ? "already" : "done");
    } catch {
      setStatus("err");
    }
  }

  return (
    <div className={cn(studioInner.card, "space-y-3")}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className={studioInner.sectionLabel}>
            <Wand2 className="h-3.5 w-3.5" />
            Initialize research directives
          </div>
          <p className="mt-1 text-[12px] text-[#9C8E78]">
            Directives are editorial categories the Writer Agent uses to group signals into leads.
            Seed them once — they persist across sessions.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void seed()}
          disabled={status === "loading" || status === "done" || status === "already"}
          className={cn(studioInner.btnSecondary, "shrink-0")}
        >
          {status === "loading" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (status === "done" || status === "already") ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <Wand2 className="h-3.5 w-3.5" />
          )}
          {status === "loading" ? "Seeding…"
            : status === "done" ? "Done"
            : status === "already" ? "Already seeded"
            : "Seed directives"}
        </button>
      </div>
      {status === "err" && (
        <p className="text-[12px] text-[#C0442A]">Something went wrong — try again.</p>
      )}
    </div>
  );
}

// ─── Main tab export ──────────────────────────────────────────────────────────

export function ResearchSetupTab() {
  const [sourceRefreshKey, setSourceRefreshKey] = useState(0);

  return (
    <div className="space-y-6">
      <ResearchIntentForm />
      <AddSourceForm onAdded={() => setSourceRefreshKey((k) => k + 1)} />
      <SourcesList refreshKey={sourceRefreshKey} />
      <SeedDirectivesPanel />
    </div>
  );
}
