/**
 * Structured view over the `fresh_signals` ("This Week in Identity") section.
 *
 * `fresh_signals` is stored on DraftContentJson as a single markdown string with a
 * fixed shape (see lib/content-outlines/default-specs.ts):
 *
 *   **Fresh Signals**
 *
 *   <Part A: synopsis prose, no URLs>
 *
 *   **First signal headline**
 *
 *   One line on why it matters.
 *
 *   Sources:
 *   - https://example.com/a
 *
 *   **Second signal headline**
 *   ...
 *
 * The Issues editor needs to add / edit / remove / reorder the Part B items without
 * losing the Part A synopsis or the header. These pure helpers parse that string into
 * a `{ synopsis, items[] }` model and serialize it back deterministically. Keeping the
 * field a string means no schema or DraftObject type change is required.
 */

export const FRESH_SIGNALS_HEADER = "**Fresh Signals**";

export type FreshSignalItem = {
  /** Headline / title of the news item. */
  headline: string;
  /** Source URL (the "Sources:" link). May be empty if not yet provided. */
  url: string;
  /** Optional one-line "why it matters" note shown between headline and source. */
  note?: string;
};

export type FreshSignalsModel = {
  /** Part A synopsis prose (everything between the header and the first item). */
  synopsis: string;
  /** Part B list of cited signal items. */
  items: FreshSignalItem[];
};

const URL_RE = /https?:\/\/[^\s)\]]+/g;

function firstUrl(text: string): string {
  const m = text.match(URL_RE);
  return m && m.length > 0 ? m[0] : "";
}

/**
 * Strip the leading `**Fresh Signals**` header line if present, returning the body.
 */
function stripHeader(raw: string): string {
  let body = raw.trim();
  body = body.replace(/^\s*\*\*\s*Fresh Signals\s*\*\*\s*\n?/i, "");
  return body.trim();
}

/** A line like `**Some Headline**` (a bold-only line) marks the start of an item. */
function boldHeadline(line: string): string | null {
  const m = line.trim().match(/^\*\*(.+?)\*\*$/);
  return m ? m[1].trim() : null;
}

/**
 * Parse a fresh_signals markdown string into a structured model. Lossless for the
 * synopsis; items keep headline, optional note, and the first source URL.
 *
 * Empty / blank input yields an empty model (synopsis "", no items).
 */
export function parseFreshSignals(raw: string | null | undefined): FreshSignalsModel {
  if (!raw || typeof raw !== "string" || !raw.trim()) {
    return { synopsis: "", items: [] };
  }
  const body = stripHeader(raw);
  if (!body) return { synopsis: "", items: [] };

  const lines = body.split("\n");
  const synopsisLines: string[] = [];
  const items: FreshSignalItem[] = [];

  let current: { headline: string; bodyLines: string[] } | null = null;

  const flush = () => {
    if (!current) return;
    const text = current.bodyLines.join("\n");
    const url = firstUrl(text);
    const sourcesIdx = text.search(/sources\s*:/i);
    const notePart = sourcesIdx >= 0 ? text.slice(0, sourcesIdx) : text;
    const note = notePart
      .replace(URL_RE, "")
      .replace(/^[\s-]*sources\s*:?/gim, "")
      .split("\n")
      .map((l) => l.replace(/^[\s-]+/, "").trim())
      .filter(Boolean)
      .join(" ")
      .trim();
    items.push({ headline: current.headline, url, note: note || undefined });
    current = null;
  };

  for (const line of lines) {
    const headline = boldHeadline(line);
    if (headline !== null) {
      flush();
      current = { headline, bodyLines: [] };
      continue;
    }
    if (current) {
      current.bodyLines.push(line);
    } else {
      synopsisLines.push(line);
    }
  }
  flush();

  return {
    synopsis: synopsisLines.join("\n").trim(),
    items,
  };
}

/**
 * Serialize a structured model back into the canonical fresh_signals markdown string.
 * Returns "" when the slot is empty (no synopsis and no items).
 */
export function serializeFreshSignals(model: FreshSignalsModel): string {
  const synopsis = (model.synopsis ?? "").trim();
  const items = (model.items ?? []).filter(
    (it) => (it.headline ?? "").trim() || (it.url ?? "").trim() || (it.note ?? "").trim()
  );

  if (!synopsis && items.length === 0) return "";

  const parts: string[] = [FRESH_SIGNALS_HEADER];
  if (synopsis) parts.push(synopsis);

  for (const it of items) {
    const headline = (it.headline ?? "").trim() || "Untitled signal";
    const block: string[] = [`**${headline}**`];
    const note = (it.note ?? "").trim();
    if (note) block.push(note);
    const url = (it.url ?? "").trim();
    if (url) block.push(`Sources:\n- ${url}`);
    parts.push(block.join("\n\n"));
  }

  return parts.join("\n\n");
}

/** True when the This Week slot has no synopsis and no items. */
export function isFreshSignalsEmpty(raw: string | null | undefined): boolean {
  const model = parseFreshSignals(raw);
  return !model.synopsis && model.items.length === 0;
}
