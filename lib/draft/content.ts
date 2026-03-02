/**
 * Structured draft content: source of truth is the content object.
 * Generate and store sections; compose full text from sections when needed.
 */

export type DraftContentJson = {
  title: string;
  hook_paragraphs: string[];
  fresh_signals: string;
  deep_dive: string;
  dojo_checklist: string[];
  promo_slot: string;
  close: string;
  sources: string[];
  metadata: { thesis?: string; model?: string };
};

export type DraftContent = {
  getTitle(): string;
  getHook(): string[];
  getFreshSignals(): string;
  getDeepDive(): string;
  getDojoChecklist(): string[];
  getPromoSlot(): string;
  getClose(): string;
  getSources(): string[];
  getMetadata(): DraftContentJson["metadata"];
  toFullText(): string;
  toJSON(): DraftContentJson;
};

function ensureStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((x): x is string => typeof x === "string");
  return [];
}

function ensureString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * Create a DraftContent wrapper from the stored JSON (e.g. from DB or API).
 * Tolerates partial or legacy shapes (missing fresh_signals, promo_slot, close).
 */
export function createDraftContent(json: Partial<DraftContentJson> | null): DraftContent {
  const raw = json ?? {};
  const title = ensureString(raw.title);
  const hook_paragraphs = Array.isArray(raw.hook_paragraphs)
    ? raw.hook_paragraphs.filter((x): x is string => typeof x === "string")
    : [];
  const fresh_signals = ensureString(raw.fresh_signals);
  const deep_dive = ensureString(raw.deep_dive);
  const dojo_checklist = ensureStringArray(raw.dojo_checklist);
  const promo_slot = ensureString(raw.promo_slot);
  const close = ensureString(raw.close);
  const sources = ensureStringArray(raw.sources);
  const metadata = raw.metadata && typeof raw.metadata === "object" ? raw.metadata : {};

  return {
    getTitle: () => title,
    getHook: () => [...hook_paragraphs],
    getFreshSignals: () => fresh_signals,
    getDeepDive: () => deep_dive,
    getDojoChecklist: () => [...dojo_checklist],
    getPromoSlot: () => promo_slot,
    getClose: () => close,
    getSources: () => [...sources],
    getMetadata: () => ({ ...metadata }),
    toFullText(): string {
      return renderDraftMarkdown({
        title,
        hook_paragraphs,
        fresh_signals,
        deep_dive,
        dojo_checklist,
        promo_slot,
        close,
        sources,
        metadata,
      });
    },
    toJSON(): DraftContentJson {
      return {
        title,
        hook_paragraphs: [...hook_paragraphs],
        fresh_signals,
        deep_dive,
        dojo_checklist: [...dojo_checklist],
        promo_slot,
        close,
        sources: [...sources],
        metadata: { ...metadata },
      };
    },
  };
}

export type DraftObject = {
  title: string;
  hook_paragraphs: string[];
  fresh_signals: string;
  deep_dive: string;
  dojo_checklist: string[];
  promo_slot: string;
  close: string;
  sources: string[];
  metadata: { model: string; thesis: string };
};

/**
 * Render a DraftContentJson into deterministic markdown with a fixed section order:
 * Title > Hook > Fresh Signals > Deep Dive > From the Dojo > Promo Slot > Close
 */
export function renderDraftMarkdown(draft: DraftContentJson): string {
  const parts: string[] = [];

  if (draft.title) parts.push(`**${draft.title}**`);
  if (draft.hook_paragraphs.length) parts.push(draft.hook_paragraphs.join("\n\n"));
  if (draft.fresh_signals) parts.push(draft.fresh_signals);
  if (draft.deep_dive) parts.push("**Deep Dive**\n\n" + draft.deep_dive);
  if (draft.dojo_checklist.length) {
    parts.push(
      "**From the Dojo**\n\n" +
        draft.dojo_checklist.map((b) => "• " + b).join("\n")
    );
  }
  if (draft.promo_slot) parts.push("**Promo Slot**\n\n" + draft.promo_slot);
  if (draft.close) parts.push("**Close**\n\n" + draft.close);

  return parts.join("\n\n");
}

/** Default close line if none stored */
export const DEFAULT_CLOSE =
  "Architecture beats tools when the environment changes faster than procurement cycles.\n\nSubscribe.";

/** Empty content object (e.g. when parsing fails or no draft yet). */
export function emptyDraftContentJson(
  metadata: { thesis?: string; model?: string } = {}
): DraftContentJson {
  return {
    title: "",
    hook_paragraphs: [],
    fresh_signals: "",
    deep_dive: "",
    dojo_checklist: [],
    promo_slot: "",
    close: "",
    sources: [],
    metadata: { ...metadata },
  };
}
