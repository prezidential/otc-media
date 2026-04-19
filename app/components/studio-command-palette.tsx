"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { STUDIO_NAV } from "@/lib/studio/nav";
import { useStudioUI } from "./studio-ui-context";
import type { SearchResultPayload } from "@/lib/search/types";

type FlatItem = {
  key: string;
  href: string;
  external?: boolean;
  primary: string;
  secondary?: string;
  group: string;
};

const PANEL = "#FBF7EE";
const INK = "#1F1A14";
const SUB = "#6B5F4E";
const LINE = "#E4D9C2";
const ACCENT = "#C8571E";

function navMatches(query: string): typeof STUDIO_NAV[number][] {
  const q = query.trim().toLowerCase();
  if (!q) return [...STUDIO_NAV];
  return STUDIO_NAV.filter(
    (n) =>
      n.label.toLowerCase().includes(q) ||
      n.href.toLowerCase().includes(q) ||
      n.keywords.toLowerCase().includes(q)
  );
}

export function StudioCommandPalette() {
  const { commandOpen, setCommandOpen, openCommandPalette } = useStudioUI();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [api, setApi] = useState<SearchResultPayload | null>(null);
  const [selected, setSelected] = useState(0);

  const reset = useCallback(() => {
    setQuery("");
    setApi(null);
    setSelected(0);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!commandOpen) {
      reset();
      return;
    }
    const t = window.setTimeout(() => inputRef.current?.focus(), 10);
    return () => window.clearTimeout(t);
  }, [commandOpen, reset]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (commandOpen) {
          setCommandOpen(false);
        } else {
          openCommandPalette();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [commandOpen, openCommandPalette, setCommandOpen]);

  useEffect(() => {
    const q = query.trim();
    if (!commandOpen) return;
    if (!q) {
      setApi(null);
      setLoading(false);
      return;
    }

    const ac = new AbortController();
    const t = window.setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ac.signal });
        const data = (await res.json()) as SearchResultPayload & { error?: string };
        if (!ac.signal.aborted) {
          if (res.ok && !("error" in data && data.error)) {
            setApi(data as SearchResultPayload);
          } else {
            setApi({ signals: [], leads: [], drafts: [], outlines: [] });
          }
        }
      } catch {
        if (!ac.signal.aborted) setApi({ signals: [], leads: [], drafts: [], outlines: [] });
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    }, 220);

    return () => {
      ac.abort();
      window.clearTimeout(t);
    };
  }, [query, commandOpen]);

  const flat = useMemo(() => {
    const items: FlatItem[] = [];
    const q = query.trim();

    for (const n of navMatches(q)) {
      items.push({
        key: `nav-${n.href}`,
        href: n.href,
        primary: n.label,
        secondary: "Go to page",
        group: "Navigation",
      });
    }

    if (api) {
      for (const s of api.signals) {
        items.push({
          key: `sig-${s.id}`,
          href: s.url || "/signals",
          external: Boolean(s.url && /^https?:/i.test(s.url)),
          primary: s.title,
          secondary: s.publisher,
          group: "Signals",
        });
      }
      for (const l of api.leads) {
        items.push({
          key: `lead-${l.id}`,
          href: "/leads",
          primary: l.angle,
          secondary: l.status,
          group: "Leads",
        });
      }
      for (const d of api.drafts) {
        items.push({
          key: `draft-${d.id}`,
          href: "/issues",
          primary: d.preview,
          secondary: "Issue draft",
          group: "Issues",
        });
      }
      for (const o of api.outlines) {
        items.push({
          key: `out-${o.id}`,
          href: "/outlines",
          primary: o.name,
          secondary: o.kind,
          group: "Outlines",
        });
      }
    }

    return items;
  }, [query, api]);

  useEffect(() => {
    setSelected((s) => (flat.length === 0 ? 0 : Math.min(s, flat.length - 1)));
  }, [flat.length]);

  useEffect(() => {
    if (!commandOpen || flat.length === 0) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${selected}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [selected, flat.length, commandOpen]);

  const activate = useCallback(
    (item: FlatItem) => {
      if (item.external) {
        window.open(item.href, "_blank", "noopener,noreferrer");
      } else {
        router.push(item.href);
      }
      setCommandOpen(false);
      reset();
    },
    [router, setCommandOpen, reset]
  );

  useEffect(() => {
    if (!commandOpen) return;
    const onDoc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setCommandOpen(false);
        reset();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelected((i) => Math.min(flat.length - 1, i + 1));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelected((i) => Math.max(0, i - 1));
      }
      if (e.key === "Enter" && flat[selected]) {
        e.preventDefault();
        activate(flat[selected]);
      }
    };
    document.addEventListener("keydown", onDoc);
    return () => document.removeEventListener("keydown", onDoc);
  }, [commandOpen, flat, selected, activate, setCommandOpen, reset]);

  if (!commandOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[12vh] px-4"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        aria-label="Close"
        onClick={() => {
          setCommandOpen(false);
          reset();
        }}
      />
      <div
        className="relative w-full max-w-lg rounded-xl border shadow-2xl overflow-hidden"
        style={{ borderColor: LINE, backgroundColor: PANEL, color: INK }}
      >
        <div className="flex items-center gap-2 border-b px-3 py-2" style={{ borderColor: LINE }}>
          <Search className="h-4 w-4 shrink-0" style={{ color: SUB }} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search pages, signals, leads, drafts…"
            className="flex-1 min-w-0 bg-transparent py-2 text-sm outline-none placeholder:text-[#9C8E78]"
            style={{ color: INK }}
          />
          {loading && <Loader2 className="h-4 w-4 shrink-0 animate-spin" style={{ color: ACCENT }} />}
        </div>
        <div ref={listRef} className="max-h-[min(60vh,420px)] overflow-y-auto py-1">
          {flat.length === 0 && (
            <div className="px-4 py-8 text-center text-sm" style={{ color: SUB }}>
              No matches. Try another term or open a destination from the sidebar.
            </div>
          )}
          {flat.map((item, idx) => {
            const active = idx === selected;
            return (
              <button
                key={item.key}
                type="button"
                data-idx={idx}
                onMouseEnter={() => setSelected(idx)}
                onClick={() => activate(item)}
                className="flex w-full flex-col items-start gap-0.5 px-4 py-2.5 text-left text-sm transition-colors"
                style={{
                  backgroundColor: active ? "#EBDFC5" : "transparent",
                  color: INK,
                }}
              >
                <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color: SUB }}>
                  {item.group}
                </span>
                <span className="font-medium line-clamp-2">{item.primary}</span>
                {item.secondary && (
                  <span className="text-xs line-clamp-1" style={{ color: SUB }}>
                    {item.secondary}
                    {item.external ? " · opens in new tab" : ""}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div
          className="border-t px-3 py-2 text-[10px] flex justify-between gap-2"
          style={{ borderColor: LINE, color: SUB }}
        >
          <span>
            <kbd className="rounded border px-1" style={{ borderColor: LINE }}>
              ↑↓
            </kbd>{" "}
            move ·{" "}
            <kbd className="rounded border px-1" style={{ borderColor: LINE }}>
              ↵
            </kbd>{" "}
            open ·{" "}
            <kbd className="rounded border px-1" style={{ borderColor: LINE }}>
              esc
            </kbd>{" "}
            close
          </span>
          <span>
            <kbd className="rounded border px-1" style={{ borderColor: LINE }}>
              ⌘K
            </kbd>{" "}
            toggle
          </span>
        </div>
      </div>
    </div>
  );
}
