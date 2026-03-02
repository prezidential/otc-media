import { describe, it, expect } from "vitest";
import {
  createDraftContent,
  validateDraftObject,
  renderDraftMarkdown,
  emptyDraftContentJson,
  DEFAULT_CLOSE,
  type DraftContentJson,
  type DraftObject,
} from "@/lib/draft/content";

function makeDraft(overrides: Partial<DraftContentJson> = {}): DraftContentJson {
  return {
    title: "Test Title",
    hook_paragraphs: ["Hook paragraph one.", "Hook paragraph two."],
    fresh_signals: "**Fresh Signals**\n\n**Signal 1**\n\nTake text.",
    deep_dive: "Deep dive prose goes here.",
    dojo_checklist: ["Bullet one.", "Bullet two.", "Bullet three.", "Bullet four.", "Bullet five."],
    promo_slot: "Subscribe to premium.",
    close: "Stay sharp.\n\nSubscribe.",
    sources: ["https://example.com/a", "https://example.com/b"],
    metadata: { thesis: "Identity is broken.", model: "claude-test" },
    ...overrides,
  };
}

function makeDraftObject(overrides: Partial<DraftObject> = {}): DraftObject {
  return {
    title: "Test Title",
    hook_paragraphs: ["Hook one."],
    fresh_signals: "Signals text",
    deep_dive: "Dive text",
    dojo_checklist: ["B1", "B2", "B3", "B4", "B5"],
    promo_slot: "Promo",
    close: "Close",
    sources: ["https://example.com"],
    metadata: { model: "claude-test", thesis: "Test thesis" },
    ...overrides,
  };
}

// ─── validateDraftObject ─────────────────────────────────────────

describe("validateDraftObject", () => {
  it("accepts a valid DraftObject", () => {
    const obj = makeDraftObject();
    expect(validateDraftObject(obj)).toEqual(obj);
  });

  it("throws on null input", () => {
    expect(() => validateDraftObject(null)).toThrow("expected an object");
  });

  it("throws on non-object input", () => {
    expect(() => validateDraftObject("string")).toThrow("expected an object");
  });

  it("throws when a required string key is missing", () => {
    const obj = makeDraftObject();
    delete (obj as Record<string, unknown>).title;
    expect(() => validateDraftObject(obj)).toThrow('"title" must be a string');
  });

  it("throws when a required string key is wrong type", () => {
    const obj = { ...makeDraftObject(), deep_dive: 42 };
    expect(() => validateDraftObject(obj)).toThrow('"deep_dive" must be a string');
  });

  it("throws when a required array key is missing", () => {
    const obj = makeDraftObject();
    delete (obj as Record<string, unknown>).hook_paragraphs;
    expect(() => validateDraftObject(obj)).toThrow('"hook_paragraphs" must be an array');
  });

  it("throws when an array contains non-string", () => {
    const obj = { ...makeDraftObject(), dojo_checklist: ["ok", 42] };
    expect(() => validateDraftObject(obj)).toThrow('"dojo_checklist" must contain only strings');
  });

  it("throws when metadata is missing", () => {
    const obj = makeDraftObject();
    delete (obj as Record<string, unknown>).metadata;
    expect(() => validateDraftObject(obj)).toThrow('"metadata" must be an object');
  });

  it("throws when metadata.model is missing", () => {
    const obj = { ...makeDraftObject(), metadata: { thesis: "ok" } };
    expect(() => validateDraftObject(obj as unknown)).toThrow("metadata.model is required");
  });

  it("throws when metadata.thesis is empty string", () => {
    const obj = { ...makeDraftObject(), metadata: { model: "m", thesis: "" } };
    expect(() => validateDraftObject(obj)).toThrow("metadata.thesis is required");
  });

  it("validates all string keys", () => {
    for (const key of ["title", "fresh_signals", "deep_dive", "promo_slot", "close"]) {
      const obj = { ...makeDraftObject(), [key]: 123 };
      expect(() => validateDraftObject(obj)).toThrow(`"${key}" must be a string`);
    }
  });

  it("validates all array keys", () => {
    for (const key of ["hook_paragraphs", "dojo_checklist", "sources"]) {
      const obj = { ...makeDraftObject(), [key]: "not array" };
      expect(() => validateDraftObject(obj)).toThrow(`"${key}" must be an array`);
    }
  });
});

// ─── renderDraftMarkdown ─────────────────────────────────────────

describe("renderDraftMarkdown", () => {
  it("renders full draft in correct section order", () => {
    const draft = makeDraft();
    const md = renderDraftMarkdown(draft);

    const titleIdx = md.indexOf("**Test Title**");
    const hookIdx = md.indexOf("Hook paragraph one.");
    const signalsIdx = md.indexOf("**Fresh Signals**");
    const deepIdx = md.indexOf("**Deep Dive**");
    const dojoIdx = md.indexOf("**From the Dojo**");
    const promoIdx = md.indexOf("**Promo Slot**");
    const closeIdx = md.indexOf("**Close**");

    expect(titleIdx).toBeGreaterThanOrEqual(0);
    expect(hookIdx).toBeGreaterThan(titleIdx);
    expect(signalsIdx).toBeGreaterThan(hookIdx);
    expect(deepIdx).toBeGreaterThan(signalsIdx);
    expect(dojoIdx).toBeGreaterThan(deepIdx);
    expect(promoIdx).toBeGreaterThan(dojoIdx);
    expect(closeIdx).toBeGreaterThan(promoIdx);
  });

  it("wraps title in bold", () => {
    const md = renderDraftMarkdown(makeDraft());
    expect(md).toContain("**Test Title**");
  });

  it("joins hook paragraphs with double newlines", () => {
    const md = renderDraftMarkdown(makeDraft());
    expect(md).toContain("Hook paragraph one.\n\nHook paragraph two.");
  });

  it("formats dojo checklist with bullet markers", () => {
    const md = renderDraftMarkdown(makeDraft());
    expect(md).toContain("• Bullet one.\n• Bullet two.");
  });

  it("omits empty sections", () => {
    const md = renderDraftMarkdown(makeDraft({ promo_slot: "", close: "" }));
    expect(md).not.toContain("**Promo Slot**");
    expect(md).not.toContain("**Close**");
  });

  it("handles empty title gracefully", () => {
    const md = renderDraftMarkdown(makeDraft({ title: "" }));
    expect(md).not.toContain("****");
  });

  it("handles empty arrays gracefully", () => {
    const md = renderDraftMarkdown(makeDraft({ hook_paragraphs: [], dojo_checklist: [] }));
    expect(md).not.toContain("**From the Dojo**");
  });

  it("returns empty string for completely empty draft", () => {
    const md = renderDraftMarkdown(emptyDraftContentJson());
    expect(md).toBe("");
  });
});

// ─── createDraftContent ──────────────────────────────────────────

describe("createDraftContent", () => {
  it("creates wrapper from full JSON", () => {
    const json = makeDraft();
    const dc = createDraftContent(json);
    expect(dc.getTitle()).toBe("Test Title");
    expect(dc.getHook()).toEqual(["Hook paragraph one.", "Hook paragraph two."]);
    expect(dc.getDeepDive()).toBe("Deep dive prose goes here.");
    expect(dc.getDojoChecklist()).toHaveLength(5);
    expect(dc.getSources()).toEqual(["https://example.com/a", "https://example.com/b"]);
  });

  it("handles null input", () => {
    const dc = createDraftContent(null);
    expect(dc.getTitle()).toBe("");
    expect(dc.getHook()).toEqual([]);
    expect(dc.getDeepDive()).toBe("");
  });

  it("handles partial input (legacy drafts)", () => {
    const dc = createDraftContent({ title: "Old Draft" });
    expect(dc.getTitle()).toBe("Old Draft");
    expect(dc.getFreshSignals()).toBe("");
    expect(dc.getDojoChecklist()).toEqual([]);
  });

  it("toFullText delegates to renderDraftMarkdown", () => {
    const json = makeDraft();
    const dc = createDraftContent(json);
    const fullText = dc.toFullText();
    const rendered = renderDraftMarkdown(json);
    expect(fullText).toBe(rendered);
  });

  it("toJSON returns a deep copy", () => {
    const json = makeDraft();
    const dc = createDraftContent(json);
    const out = dc.toJSON();
    out.hook_paragraphs.push("mutated");
    expect(dc.getHook()).not.toContain("mutated");
  });

  it("getters return copies (not references)", () => {
    const dc = createDraftContent(makeDraft());
    const hook1 = dc.getHook();
    const hook2 = dc.getHook();
    expect(hook1).toEqual(hook2);
    expect(hook1).not.toBe(hook2);
  });

  it("filters non-string items from arrays", () => {
    const dc = createDraftContent({
      hook_paragraphs: ["ok", 42 as unknown as string, "also ok"],
      dojo_checklist: [null as unknown as string, "valid"],
    } as Partial<DraftContentJson>);
    expect(dc.getHook()).toEqual(["ok", "also ok"]);
    expect(dc.getDojoChecklist()).toEqual(["valid"]);
  });
});

// ─── emptyDraftContentJson ───────────────────────────────────────

describe("emptyDraftContentJson", () => {
  it("returns all empty fields", () => {
    const empty = emptyDraftContentJson();
    expect(empty.title).toBe("");
    expect(empty.hook_paragraphs).toEqual([]);
    expect(empty.fresh_signals).toBe("");
    expect(empty.deep_dive).toBe("");
    expect(empty.dojo_checklist).toEqual([]);
    expect(empty.promo_slot).toBe("");
    expect(empty.close).toBe("");
    expect(empty.sources).toEqual([]);
    expect(empty.metadata).toEqual({});
  });

  it("accepts metadata override", () => {
    const empty = emptyDraftContentJson({ thesis: "Test", model: "m" });
    expect(empty.metadata).toEqual({ thesis: "Test", model: "m" });
  });

  it("does not share metadata reference", () => {
    const meta = { thesis: "X" };
    const a = emptyDraftContentJson(meta);
    const b = emptyDraftContentJson(meta);
    a.metadata.thesis = "mutated";
    expect(b.metadata.thesis).toBe("X");
  });
});

// ─── DEFAULT_CLOSE ───────────────────────────────────────────────

describe("DEFAULT_CLOSE", () => {
  it("contains Subscribe CTA", () => {
    expect(DEFAULT_CLOSE).toContain("Subscribe.");
  });

  it("is a non-empty string", () => {
    expect(typeof DEFAULT_CLOSE).toBe("string");
    expect(DEFAULT_CLOSE.length).toBeGreaterThan(0);
  });
});
