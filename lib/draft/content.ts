/**
 * Structured draft content: source of truth is the content object.
 * Generate and store sections; compose full text from sections when needed.
 */

export type DraftContentJson = {
  title: string;
  hook_paragraphs: string[];
  fresh_signals: string;
  deep_dive: string;
  last_word: string;
  promo_slot: string;
  close: string;
  sources: string[];
  /**
   * Optional marker for where the premium paywall break should go (e.g. a
   * section name like "deep_dive"). Beehiiv has NO API/MCP to insert the break,
   * so this is a reminder/marker only — the human inserts it in the Beehiiv
   * editor. Absent on most drafts; see definition-of-done.md §4 (P1-1/honesty).
   */
  paywall_after_section?: string;
  metadata: {
    thesis?: string;
    model?: string;
    /** Beehiiv post id stored after first publish, for create-once-edit-many. */
    beehiiv_post_id?: string;
    /** Optional email preview text (inbox snippet) pushed to Beehiiv on publish. */
    preview_text?: string;
    /** Optional SEO/social card overrides pushed to Beehiiv on publish. */
    seo?: Record<string, unknown>;
  };
};

export type DraftObject = {
  title: string;
  hook_paragraphs: string[];
  fresh_signals: string;
  deep_dive: string;
  last_word: string;
  promo_slot: string;
  close: string;
  sources: string[];
  metadata: { model: string; thesis: string };
};

const DRAFT_STRING_KEYS = [
  "title",
  "fresh_signals",
  "deep_dive",
  "last_word",
  "promo_slot",
  "close",
] as const;

const DRAFT_ARRAY_KEYS = [
  "hook_paragraphs",
  "sources",
] as const;

export function validateDraftObject(obj: unknown): DraftObject {
  if (!obj || typeof obj !== "object") {
    throw new Error("DraftObject validation failed: expected an object");
  }
  const o = obj as Record<string, unknown>;

  for (const key of DRAFT_STRING_KEYS) {
    if (typeof o[key] !== "string") {
      throw new Error(
        `DraftObject validation failed: "${key}" must be a string`
      );
    }
  }

  for (const key of DRAFT_ARRAY_KEYS) {
    if (!Array.isArray(o[key])) {
      throw new Error(
        `DraftObject validation failed: "${key}" must be an array`
      );
    }
    for (const item of o[key] as unknown[]) {
      if (typeof item !== "string") {
        throw new Error(
          `DraftObject validation failed: "${key}" must contain only strings`
        );
      }
    }
  }

  if (!o.metadata || typeof o.metadata !== "object") {
    throw new Error(
      'DraftObject validation failed: "metadata" must be an object'
    );
  }
  const meta = o.metadata as Record<string, unknown>;
  if (typeof meta.model !== "string" || !meta.model) {
    throw new Error(
      "DraftObject validation failed: metadata.model is required"
    );
  }
  if (typeof meta.thesis !== "string" || !meta.thesis) {
    throw new Error(
      "DraftObject validation failed: metadata.thesis is required"
    );
  }

  return obj as DraftObject;
}

export type DraftContent = {
  getTitle(): string;
  getHook(): string[];
  getFreshSignals(): string;
  getDeepDive(): string;
  getLastWord(): string;
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
  const last_word = ensureString(raw.last_word);
  const promo_slot = ensureString(raw.promo_slot);
  const close = ensureString(raw.close);
  const sources = ensureStringArray(raw.sources);
  const metadata = raw.metadata && typeof raw.metadata === "object" ? raw.metadata : {};

  return {
    getTitle: () => title,
    getHook: () => [...hook_paragraphs],
    getFreshSignals: () => fresh_signals,
    getDeepDive: () => deep_dive,
    getLastWord: () => last_word,
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
        last_word,
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
        last_word,
        promo_slot,
        close,
        sources: [...sources],
        metadata: { ...metadata },
      };
    },
  };
}

/**
 * Render a DraftContentJson into deterministic markdown with a fixed section order:
 * Title > Hook > Fresh Signals > Deep Dive > The Last Word > Promo Slot > Close
 */
export function renderDraftMarkdown(draft: DraftContentJson): string {
  const parts: string[] = [];

  if (draft.title) parts.push(`**${draft.title}**`);
  if (draft.hook_paragraphs.length) parts.push(draft.hook_paragraphs.join("\n\n"));
  if (draft.fresh_signals) parts.push(draft.fresh_signals);
  if (draft.deep_dive) parts.push("**Deep Dive**\n\n" + draft.deep_dive);
  if (draft.last_word) parts.push("**The Last Word**\n\n" + draft.last_word);
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
    last_word: "",
    promo_slot: "",
    close: "",
    sources: [],
    metadata: { ...metadata },
  };
}
