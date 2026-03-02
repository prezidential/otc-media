/**
 * Parse full-issue draft text into structured content_json (for backward compat / loading old drafts).
 * Uses DraftContentJson from content.ts (full shape); parsed fields not present in text get "".
 */
import type { DraftContentJson } from "@/lib/draft/content";

const SECTION_HEADER = /\n(?=\d\)\s)/;
const SECTION_HEADER_ALT = /\n(?=\d\.\s)/;

export type { DraftContentJson };

/** Known section headers (with optional parentheticals). Match from start of line. */
const SECTION_MARKERS = [
  /^\s*1\)\s+Title\b/m,
  /^\s*2\)\s+Opening Hook\b/m,
  /^\s*3\)\s+Fresh Signals\b/m,
  /^\s*4\)\s+Deep Dive\b/m,
  /^\s*5\)\s+From the Dojo\b/m,
  /^\s*6\)\s+Promo Slot\b/m,
  /^\s*7\)\s+Close\b/m,
] as const;

const SECTION_MARKERS_ALT = [
  /^\s*1\.\s+Title\b/m,
  /^\s*2\.\s+Opening Hook\b/m,
  /^\s*3\.\s+Fresh Signals\b/m,
  /^\s*4\.\s+Deep Dive\b/m,
  /^\s*5\.\s+From the Dojo\b/m,
  /^\s*6\.\s+Promo Slot\b/m,
  /^\s*7\.\s+Close\b/m,
] as const;

function getSectionBody(block: string): string {
  const firstNewline = block.indexOf("\n");
  if (firstNewline === -1) return block.trim();
  return block.slice(firstNewline + 1).trim();
}

function extractUrls(text: string): string[] {
  const matches = text.match(/https?:\/\/[^\s)\]]+/g) ?? [];
  return [...new Set(matches)];
}

/**
 * Find start indices of each section header (0..6). Returns array of 7 indices, or empty if not found.
 */
function findSectionStarts(text: string): number[] {
  const markers = SECTION_MARKERS;
  const alt = SECTION_MARKERS_ALT;
  const indices: number[] = [];
  for (let i = 0; i < markers.length; i++) {
    const m = text.match(markers[i]);
    const mAlt = text.match(alt[i]);
    const pos = m ? m.index! : -1;
    const posAlt = mAlt ? mAlt.index! : -1;
    const best = pos >= 0 && (posAlt < 0 || pos <= posAlt) ? pos : posAlt;
    if (best >= 0) indices.push(best);
    else return [];
  }
  return indices;
}

/**
 * Extract section body between two header start indices (from end of first header line to start of next).
 */
function extractBetween(text: string, start: number, nextStart: number): string {
  const from = text.indexOf("\n", start);
  const sliceStart = from === -1 ? start : from + 1;
  const body = nextStart > sliceStart
    ? text.slice(sliceStart, nextStart)
    : text.slice(sliceStart);
  return body.trim();
}

/** Markdown-style bold section headers (e.g. **Fresh Signals**, **Deep Dive**) */
const MD_FRESH_SIGNALS = /\*\*Fresh Signals\*\*/i;
const MD_DEEP_DIVE = /\*\*Deep Dive\*\*/i;
const MD_FROM_THE_DOJO = /\*\*From the Dojo\*\*/i;
const MD_PROMO_SLOT = /\*\*Promo Slot\*\*/i;
const MD_CLOSE = /\*\*Close\*\*/i;

/**
 * Parse draft that uses markdown bold headers: **Title**, **Fresh Signals**, **Deep Dive**, **From the Dojo**, etc.
 * Title = first line (often "**...**"); hook = everything after first line until **Fresh Signals**.
 */
function parseMarkdownFormat(
  normalized: string,
  metadata: { thesis?: string; model?: string }
): DraftContentJson | null {
  const freshIdx = normalized.search(MD_FRESH_SIGNALS);
  const deepIdx = normalized.search(MD_DEEP_DIVE);
  const dojoIdx = normalized.search(MD_FROM_THE_DOJO);
  const promoIdx = normalized.search(MD_PROMO_SLOT);
  const closeIdx = normalized.search(MD_CLOSE);
  if (freshIdx < 0 || deepIdx < 0 || dojoIdx < 0) return null;

  const beforeFresh = normalized.slice(0, freshIdx).trim();
  const firstLineEnd = beforeFresh.indexOf("\n");
  const title = (firstLineEnd === -1 ? beforeFresh : beforeFresh.slice(0, firstLineEnd))
    .replace(/\*\*/g, "")
    .trim();
  const hookBody =
    firstLineEnd === -1 ? "" : beforeFresh.slice(firstLineEnd + 1).trim();
  const hook_paragraphs = hookBody
    ? hookBody.split(/\n\n+/).map((p) => p.trim()).filter(Boolean)
    : [];

  const fresh_signals = normalized.slice(freshIdx, deepIdx).trim();
  const deepDiveBody = extractBetween(normalized, deepIdx, dojoIdx);
  const dojoEnd = promoIdx >= 0 ? promoIdx : closeIdx >= 0 ? closeIdx : normalized.length;
  const dojoBody = normalized.slice(dojoIdx, dojoEnd);
  const dojoBodyOnly = getSectionBody(dojoBody);
  const dojo_checklist = dojoBodyOnly
    ? dojoBodyOnly
        .split(/\n/)
        .map((l) => l.replace(/^[•\-*]\s*/, "").trim())
        .filter(Boolean)
    : [];
  const sources = extractUrls(fresh_signals);
  const promo_slot =
    promoIdx >= 0 && closeIdx >= 0 ? extractBetween(normalized, promoIdx, closeIdx) : "";
  const close =
    closeIdx >= 0
      ? normalized.slice(closeIdx).replace(/^\s*\*\*Close\*\*\s*\n?/i, "").trim()
      : "";

  return {
    title,
    hook_paragraphs,
    fresh_signals,
    deep_dive: deepDiveBody,
    dojo_checklist,
    promo_slot,
    close,
    sources,
    metadata: { ...metadata },
  };
}

/**
 * Parse draft plain text into structured content_json by locating exact section headers.
 * Tries numbered format (1) Title, 2) Opening Hook, ...) first, then markdown (**Fresh Signals**, **Deep Dive**, ...).
 */
export function parseDraftToStructured(
  draftText: string,
  metadata: { thesis?: string; model?: string }
): DraftContentJson | null {
  const normalized = draftText.replace(/\r\n/g, "\n").trim();
  if (!normalized) return null;

  let result: DraftContentJson | null = null;

  const starts = findSectionStarts(normalized);
  if (starts.length >= 5) {
    const titleBody = extractBetween(normalized, starts[0], starts[1]);
    const hookBody = extractBetween(normalized, starts[1], starts[2]);
    const signalsBody = extractBetween(normalized, starts[2], starts[3]);
    const deepDiveBody = extractBetween(normalized, starts[3], starts[4]);
    const dojoBody = extractBetween(normalized, starts[4], starts[5] ?? normalized.length);
    const title = titleBody.split("\n")[0]?.trim() ?? "";
    const hook_paragraphs = hookBody
      ? hookBody.split(/\n\n+/).map((p) => p.trim()).filter(Boolean)
      : [];
    const dojo_checklist = dojoBody
      ? dojoBody.split(/\n/).map((l) => l.replace(/^[-*]\s*/, "").trim()).filter(Boolean)
      : [];
    const fresh_signals = normalized.slice(starts[2], starts[3]).trim();
    result = {
      title,
      hook_paragraphs,
      fresh_signals,
      deep_dive: deepDiveBody,
      dojo_checklist,
      promo_slot: "",
      close: "",
      sources: extractUrls(signalsBody),
      metadata: { ...metadata },
    };
  }

  if (!result) {
    result = parseMarkdownFormat(normalized, metadata);
  }
  return result;
}

export { emptyDraftContentJson as emptyContentJson } from "@/lib/draft/content";

export type RegeneratableSection = "title" | "hook" | "deep_dive" | "dojo_checklist";

const SECTION_INDEX: Record<RegeneratableSection, number> = {
  title: 0,
  hook: 1,
  deep_dive: 3,
  dojo_checklist: 4,
};

/**
 * Get section blocks when draft uses markdown **Headers**. Returns 5 blocks so SECTION_INDEX aligns.
 */
function getSectionBlocksMarkdown(trimmed: string): string[] | null {
  const freshIdx = trimmed.search(MD_FRESH_SIGNALS);
  const deepIdx = trimmed.search(MD_DEEP_DIVE);
  const dojoIdx = trimmed.search(MD_FROM_THE_DOJO);
  const promoIdx = trimmed.search(MD_PROMO_SLOT);
  const closeIdx = trimmed.search(MD_CLOSE);
  if (freshIdx < 0 || deepIdx < 0 || dojoIdx < 0) return null;
  const dojoEnd = promoIdx >= 0 ? promoIdx : closeIdx >= 0 ? closeIdx : trimmed.length;
  const beforeFresh = trimmed.slice(0, freshIdx).trim();
  const firstLineEnd = beforeFresh.indexOf("\n");
  const titleBlock = firstLineEnd === -1 ? beforeFresh : beforeFresh.slice(0, firstLineEnd);
  const hookBlock = firstLineEnd === -1 ? "" : beforeFresh.slice(firstLineEnd + 1).trim();
  return [
    titleBlock,
    hookBlock,
    trimmed.slice(freshIdx, deepIdx).trim(),
    trimmed.slice(deepIdx, dojoIdx).trim(),
    trimmed.slice(dojoIdx, dojoEnd).trim(),
  ];
}

/**
 * Split content into section blocks using the same header markers as parsing.
 * Returns array of full blocks (header + body) for sections 1–5 so indices match SECTION_INDEX.
 */
export function getSectionBlocks(content: string): string[] {
  const trimmed = content.replace(/\r\n/g, "\n").trim();
  if (!trimmed) return [];
  const starts = findSectionStarts(trimmed);
  if (starts.length >= 5) {
    const blocks: string[] = [];
    for (let i = 0; i < 5; i++) {
      const nextStart = i + 1 < starts.length ? starts[i + 1] : trimmed.length;
      blocks.push(trimmed.slice(starts[i], nextStart).trim());
    }
    return blocks;
  }
  const mdBlocks = getSectionBlocksMarkdown(trimmed);
  if (mdBlocks) return mdBlocks;
  const parts = trimmed.split(SECTION_HEADER).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 5) return parts;
  return trimmed.split(SECTION_HEADER_ALT).map((p) => p.trim()).filter(Boolean);
}

/**
 * Replace one section's body in the full content and return updated content.
 * sectionKey must be one of the regeneratable sections.
 */
export function replaceSectionInContent(
  content: string,
  section: RegeneratableSection,
  newBody: string
): string {
  const blocks = getSectionBlocks(content);
  const idx = SECTION_INDEX[section];
  if (idx < 0 || idx >= blocks.length) return content;
  const block = blocks[idx];
  const trimmedNew = newBody.trim();
  let newBlock: string;
  if (section === "hook") {
    newBlock = trimmedNew || block;
  } else {
    const firstLineEnd = block.indexOf("\n");
    const header = firstLineEnd === -1 ? block : block.slice(0, firstLineEnd);
    newBlock = trimmedNew ? `${header}\n\n${trimmedNew}` : header;
  }
  const newBlocks = [...blocks];
  newBlocks[idx] = newBlock;
  return newBlocks.join("\n\n");
}
