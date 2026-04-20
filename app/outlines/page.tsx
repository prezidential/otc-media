"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Check,
  ChevronRight,
  Loader2,
  Newspaper,
  Plus,
  Save,
  ShieldOff,
  X,
} from "lucide-react";
import { PageHeader } from "../components/page-header";
import { cn } from "@/lib/utils";
import { studioInner } from "@/lib/studio/inner-classes";
import type { ContentOutlineApiRow } from "@/lib/content-outlines/api-serialize";
import { DEFAULT_INSIDER_OUTLINE, DEFAULT_NEWSLETTER_OUTLINE } from "@/lib/content-outlines/default-specs";
import {
  INSIDER_USER_PLACEHOLDERS,
  NEWSLETTER_USER_PLACEHOLDERS,
  specJsonToFormFields,
} from "@/lib/content-outlines/spec-form";
import { OUTLINE_KINDS, type OutlineKind } from "@/lib/content-outlines/types";

type PanelSelection = null | "new" | string;

type FormState = {
  name: string;
  kind: OutlineKind;
  is_default: boolean;
  userPromptTemplate: string;
  systemPromptSuffix: string;
  insiderSystemPrompt: string;
};

function formFromDefaults(kind: OutlineKind): FormState {
  const base =
    kind === "newsletter_issue"
      ? specJsonToFormFields("newsletter_issue", DEFAULT_NEWSLETTER_OUTLINE)
      : specJsonToFormFields("insider_access", DEFAULT_INSIDER_OUTLINE);
  return {
    name: "",
    kind,
    is_default: false,
    userPromptTemplate: base.userPromptTemplate,
    systemPromptSuffix: base.systemPromptSuffix,
    insiderSystemPrompt: base.insiderSystemPrompt,
  };
}

function formFromRow(row: ContentOutlineApiRow): FormState {
  return {
    name: row.name,
    kind: row.kind,
    is_default: row.is_default,
    userPromptTemplate: row.userPromptTemplate,
    systemPromptSuffix: row.systemPromptSuffix,
    insiderSystemPrompt: row.insiderSystemPrompt,
  };
}

function kindLabel(k: string) {
  return k === "newsletter_issue" ? "Newsletter" : k === "insider_access" ? "Insider Access" : k;
}

function placeholderKeys(kind: OutlineKind) {
  return kind === "newsletter_issue" ? NEWSLETTER_USER_PLACEHOLDERS : INSIDER_USER_PLACEHOLDERS;
}

export default function OutlinesPage() {
  const [outlines, setOutlines] = useState<ContentOutlineApiRow[]>([]);
  const [includeDisabled, setIncludeDisabled] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [selection, setSelection] = useState<PanelSelection>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [disabling, setDisabling] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  const selectedRow = useMemo(
    () => (selection && selection !== "new" ? outlines.find((o) => o.id === selection) ?? null : null),
    [outlines, selection]
  );

  const isReadOnly = Boolean(selectedRow?.disabled_at);
  const isNew = selection === "new";

  const loadOutlines = useCallback(async () => {
    setLoadingList(true);
    setListError(null);
    try {
      const q = includeDisabled ? "?includeDisabled=1" : "";
      const res = await fetch(`/api/content-outlines${q}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setListError(typeof data.error === "string" ? data.error : `Failed to load (${res.status})`);
        setOutlines([]);
        return;
      }
      setOutlines((data.outlines ?? []) as ContentOutlineApiRow[]);
    } finally {
      setLoadingList(false);
    }
  }, [includeDisabled]);

  useEffect(() => {
    void loadOutlines();
  }, [loadOutlines]);

  useEffect(() => {
    if (selection && selection !== "new" && !outlines.some((o) => o.id === selection)) {
      setSelection(null);
      setForm(null);
      setWarnings([]);
      setActionError(null);
    }
  }, [outlines, selection]);

  const placeholderStatus = useMemo(() => {
    if (!form) return [];
    const hintKeys = placeholderKeys(form.kind);
    const t = form.userPromptTemplate;
    return hintKeys.map((key) => ({
      key,
      ok: t.includes(`{{${key}}}`),
    }));
  }, [form]);

  function openNew() {
    setSelection("new");
    setForm(formFromDefaults("newsletter_issue"));
    setWarnings([]);
    setActionError(null);
  }

  function openRow(row: ContentOutlineApiRow) {
    setSelection(row.id);
    setForm(formFromRow(row));
    setWarnings([]);
    setActionError(null);
  }

  function closePanel() {
    setSelection(null);
    setForm(null);
    setWarnings([]);
    setActionError(null);
  }

  function insertPlaceholder(key: string) {
    if (!form || isReadOnly) return;
    const token = `{{${key}}}`;
    setForm((f) => {
      if (!f) return f;
      const needsSpace = f.userPromptTemplate.length > 0 && !/\s$/.test(f.userPromptTemplate);
      return {
        ...f,
        userPromptTemplate: f.userPromptTemplate + (needsSpace ? " " : "") + token,
      };
    });
  }

  function buildPayload(f: FormState): Record<string, unknown> {
    const base: Record<string, unknown> = {
      name: f.name.trim(),
      kind: f.kind,
      is_default: f.is_default,
      userPromptTemplate: f.userPromptTemplate,
    };
    if (f.kind === "newsletter_issue") {
      base.systemPromptSuffix = f.systemPromptSuffix;
    } else {
      base.insiderSystemPrompt = f.insiderSystemPrompt;
    }
    return base;
  }

  async function saveOutline() {
    if (!form || isReadOnly) return;
    setSaving(true);
    setActionError(null);
    setWarnings([]);
    try {
      if (isNew) {
        const res = await fetch("/api/content-outlines", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildPayload(form)),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setActionError(typeof data.error === "string" ? data.error : `Save failed (${res.status})`);
          return;
        }
        if (data.outline?.id) {
          setSelection(data.outline.id);
          setForm(formFromRow(data.outline as ContentOutlineApiRow));
        }
        setWarnings(Array.isArray(data.warnings) ? data.warnings : []);
        await loadOutlines();
        return;
      }

      const res = await fetch(`/api/content-outlines/${selection}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload(form)),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setActionError(typeof data.error === "string" ? data.error : `Save failed (${res.status})`);
        return;
      }
      if (data.outline) {
        setForm(formFromRow(data.outline as ContentOutlineApiRow));
      }
      setWarnings(Array.isArray(data.warnings) ? data.warnings : []);
      await loadOutlines();
    } finally {
      setSaving(false);
    }
  }

  async function disableOutline() {
    if (!selection || selection === "new" || !selectedRow || selectedRow.disabled_at) return;
    if (!window.confirm(`Disable outline "${selectedRow.name}"? It will stay in the database but won’t be used for generation.`)) {
      return;
    }
    setDisabling(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/content-outlines/${selection}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setActionError(typeof data.error === "string" ? data.error : `Disable failed (${res.status})`);
        return;
      }
      closePanel();
      await loadOutlines();
    } finally {
      setDisabling(false);
    }
  }

  const inputClass = cn(studioInner.input, "disabled:opacity-60 disabled:cursor-not-allowed");
  const selectClass = cn(studioInner.select, "disabled:opacity-60");

  return (
    <div className={studioInner.pageRootWide}>
      <PageHeader
        variant="studio"
        title="Content outlines"
        description="Structured prompts for newsletter and Insider Access generation. Disabled outlines are kept for history but cannot be edited or re-enabled from the UI."
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Link href="/issues" className={cn(studioInner.link, "inline-flex items-center gap-1 text-xs font-medium")}>
          <ChevronRight className="h-3.5 w-3.5 rotate-180" />
          Back to Issues
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <div className={cn(studioInner.card, "!p-4")}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <span className={studioInner.sectionLabel}>Library</span>
            <button
              type="button"
              onClick={() => openNew()}
              className={studioInner.btnPrimary + " !px-3 !py-1.5 !text-xs"}
            >
              <Plus className="h-3.5 w-3.5" />
              New outline
            </button>
          </div>

          <label className={cn(studioInner.body, "mb-3 flex cursor-pointer items-center gap-2 text-xs select-none")}>
            <input
              type="checkbox"
              checked={includeDisabled}
              onChange={(e) => setIncludeDisabled(e.target.checked)}
              className="rounded border-[#E4D9C2]"
            />
            Show disabled
          </label>

          {loadingList ? (
            <div className="flex items-center justify-center py-12 text-[#6B5F4E]">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : listError ? (
            <div className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">{listError}</div>
          ) : outlines.length === 0 ? (
            <div className="py-8 text-center text-sm text-[#6B5F4E]">No outlines yet. Create one or seed from Issues.</div>
          ) : (
            <ul className="space-y-1 max-h-[min(60vh,520px)] overflow-auto pr-1">
              {outlines.map((o) => {
                const active = selection === o.id;
                const disabled = o.disabled_at != null;
                return (
                  <li key={o.id}>
                    <button
                      type="button"
                      onClick={() => openRow(o)}
                      className={cn(
                        "w-full border-l-[3px] py-3 pl-[18px] pr-[18px] text-left text-sm transition-colors",
                        active
                          ? "border-l-[#C8571E] bg-[#EBDFC5] text-[#1F1A14]"
                          : "border-l-transparent hover:bg-[#EBDFC5]/50",
                        disabled && "opacity-70"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-medium text-[#1F1A14] line-clamp-2">{o.name}</span>
                        {o.is_default && <span className="flex-shrink-0 font-mono text-[10px] text-primary">★</span>}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <span className="font-[family-name:var(--font-geist-mono)] text-[9px] uppercase tracking-[0.15em] text-[#6B5F4E]">
                          {kindLabel(o.kind)}
                        </span>
                        {disabled && (
                          <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-[#6B5F4E]">
                            Disabled
                          </span>
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className={cn(studioInner.card, "min-h-[320px]")}>
          {!form ? (
            <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-2 px-6 text-center">
              <Newspaper className="h-10 w-10 text-[#C8571E]/25" />
              <p className="font-[family-name:var(--font-instrument-serif)] text-lg italic text-[#6B5F4E]">
                Select an outline from the library
              </p>
              <p className={studioInner.body}>Or create a new structured prompt template.</p>
            </div>
          ) : (
            <>
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-[family-name:var(--font-instrument-serif)] text-[22px] font-normal italic leading-tight text-[#1F1A14]">
                    {isNew ? "New outline" : form.name || "Edit outline"}
                  </h2>
                  <p className="mt-1 font-[family-name:var(--font-geist-mono)] text-[10px] uppercase tracking-[0.16em] text-[#6B5F4E]">
                    {kindLabel(form.kind)} · {isNew ? "unsaved" : "saved"}
                  </p>
                  {isReadOnly && (
                    <p className="mt-1 text-xs text-[#6B5F4E]">
                      This outline is disabled and cannot be edited. There is no restore action in this version.
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={closePanel} className={studioInner.btnSecondary + " !px-3 !py-2 !text-xs"}>
                    <X className="h-3.5 w-3.5" />
                    Close
                  </button>
                  {!isReadOnly && (
                    <>
                      <button
                        type="button"
                        onClick={() => void saveOutline()}
                        disabled={saving}
                        className={studioInner.btnPrimary + " !px-4 !py-2 !text-xs"}
                      >
                        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                        Save
                      </button>
                      {!isNew && (
                        <button
                          type="button"
                          onClick={() => void disableOutline()}
                          disabled={disabling}
                          className="inline-flex items-center gap-1.5 rounded-full border border-[#C0442A]/40 bg-[#C0442A]/08 px-3 py-2 text-xs font-medium text-[#C0442A] hover:bg-[#C0442A]/12 disabled:opacity-50"
                        >
                          {disabling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldOff className="h-3.5 w-3.5" />}
                          Disable
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>

              {actionError && (
                <div className="mb-4 rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">{actionError}</div>
              )}

              {warnings.length > 0 && (
                <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-3 text-sm text-amber-900 dark:text-amber-100">
                  <div className="mb-2 flex items-center gap-2 font-medium">
                    <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                    Warnings
                  </div>
                  <ul className="list-inside list-disc space-y-1 text-xs opacity-90">
                    {warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="grid gap-5 lg:grid-cols-[1fr_220px]">
                <div className="space-y-4">
                  <label className="block">
                    <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-wider text-[#6B5F4E]">Name</span>
                    <input
                      type="text"
                      value={form.name}
                      onChange={(e) => setForm((f) => (f ? { ...f, name: e.target.value } : f))}
                      disabled={isReadOnly}
                      className={inputClass}
                      placeholder="e.g. Default newsletter Q1"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-wider text-[#6B5F4E]">Kind</span>
                    <select
                      value={form.kind}
                      disabled={isReadOnly || !isNew}
                      onChange={(e) => {
                        const k = e.target.value as OutlineKind;
                        setForm((f) => {
                          if (!f) return f;
                          if (!isNew) return f;
                          const next = formFromDefaults(k);
                          return { ...next, name: f.name, is_default: f.is_default };
                        });
                      }}
                      className={selectClass + " w-full"}
                    >
                      {OUTLINE_KINDS.map((k) => (
                        <option key={k} value={k}>
                          {kindLabel(k)}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="flex cursor-pointer items-center gap-2 text-sm text-[#1F1A14] select-none">
                    <input
                      type="checkbox"
                      checked={form.is_default}
                      disabled={isReadOnly}
                      onChange={(e) => setForm((f) => (f ? { ...f, is_default: e.target.checked } : f))}
                      className="rounded border-border"
                    />
                    Default for this kind (clears other defaults when saved)
                  </label>

                  <label className="block">
                    <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-wider text-[#6B5F4E]">
                      User prompt template
                    </span>
                    <textarea
                      value={form.userPromptTemplate}
                      onChange={(e) => setForm((f) => (f ? { ...f, userPromptTemplate: e.target.value } : f))}
                      disabled={isReadOnly}
                      rows={14}
                      className={inputClass + " font-mono text-xs leading-relaxed resize-y min-h-[200px]"}
                    />
                  </label>

                  {form.kind === "newsletter_issue" ? (
                    <label className="block">
                      <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-wider text-[#6B5F4E]">
                        System prompt suffix
                      </span>
                      <textarea
                        value={form.systemPromptSuffix}
                        onChange={(e) => setForm((f) => (f ? { ...f, systemPromptSuffix: e.target.value } : f))}
                        disabled={isReadOnly}
                        rows={6}
                        className={inputClass + " font-mono text-xs leading-relaxed resize-y min-h-[120px]"}
                      />
                    </label>
                  ) : (
                    <label className="block">
                      <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-wider text-[#6B5F4E]">
                        Insider system prompt
                      </span>
                      <textarea
                        value={form.insiderSystemPrompt}
                        onChange={(e) => setForm((f) => (f ? { ...f, insiderSystemPrompt: e.target.value } : f))}
                        disabled={isReadOnly}
                        rows={8}
                        className={inputClass + " font-mono text-xs leading-relaxed resize-y min-h-[160px]"}
                      />
                    </label>
                  )}
                </div>

                <div className="rounded-lg border border-border bg-background/50 p-3 h-fit lg:sticky lg:top-6">
                  <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-[#6B5F4E]">Placeholders</div>
                  <p className="mb-3 text-[11px] leading-snug text-[#6B5F4E]">
                    Tokens must appear in the user prompt as <code className="font-mono text-[10px]">{"{{NAME}}"}</code>. Status updates as you type.
                  </p>
                  <ul className="space-y-2">
                    {placeholderStatus.map(({ key, ok }) => (
                      <li key={key} className="flex items-center justify-between gap-2 text-xs">
                        <span className="flex items-center gap-1.5 min-w-0">
                          {ok ? (
                            <Check className="h-3.5 w-3.5 flex-shrink-0 text-primary" />
                          ) : (
                            <span className="h-3.5 w-3.5 flex-shrink-0 rounded-full border border-muted-foreground/40" />
                          )}
                          <code className="font-mono text-[10px] truncate">{`{{${key}}}`}</code>
                        </span>
                        {!isReadOnly && (
                          <button
                            type="button"
                            onClick={() => insertPlaceholder(key)}
                            className="flex-shrink-0 rounded border border-border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-[#6B5F4E] hover:bg-accent hover:text-[#1F1A14] transition-colors"
                          >
                            Add
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
