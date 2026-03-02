import { describe, it, expect } from "vitest";
import {
  lintDraft,
  applyDashReplaceMap,
  FORBIDDEN_LINT_PATTERNS,
  DASH_REPLACE_MAP,
} from "@/lib/draft/lint";

// ─── lintDraft ───────────────────────────────────────────────────

describe("lintDraft", () => {
  it("returns empty array for clean text", () => {
    expect(lintDraft("This is a clean sentence.")).toEqual([]);
  });

  it("returns empty array for empty text", () => {
    expect(lintDraft("")).toEqual([]);
    expect(lintDraft("   ")).toEqual([]);
  });

  it("detects em dash", () => {
    const violations = lintDraft("Identity programs \u2014 at scale \u2014 are failing.");
    expect(violations.some((v) => v.type === "em_dash")).toBe(true);
  });

  it("detects en dash", () => {
    const violations = lintDraft("Deploy faster \u2013 or fall behind.");
    expect(violations.some((v) => v.type === "en_dash")).toBe(true);
  });

  it("detects space-dash-space pattern", () => {
    const violations = lintDraft("This approach - while common - fails.");
    expect(violations.some((v) => v.type === "space_dash_space")).toBe(true);
  });

  it("detects forbidden phrases (case insensitive)", () => {
    for (const phrase of FORBIDDEN_LINT_PATTERNS) {
      const violations = lintDraft(`We think ${phrase} something else.`);
      expect(violations.some((v) => v.type === "forbidden_phrase")).toBe(true);
    }
  });

  it("detects forbidden phrases with different casing", () => {
    const violations = lintDraft("THE REAL ISSUE IS governance.");
    expect(violations.some((v) => v.type === "forbidden_phrase")).toBe(true);
  });

  it("excludes Sources: lines from lint", () => {
    const text = "Sources:\n- https://example.com\n---";
    expect(lintDraft(text)).toEqual([]);
  });

  it("excludes URL-only lines from lint", () => {
    expect(lintDraft("- https://example.com/article-with-dashes")).toEqual([]);
  });

  it("excludes --- separator lines", () => {
    expect(lintDraft("---")).toEqual([]);
  });

  it("reports correct line numbers", () => {
    const text = "Line one.\nThe real issue is something.\nLine three.";
    const violations = lintDraft(text);
    expect(violations[0].lineNumber).toBe(2);
  });

  it("reports multiple violations on different lines", () => {
    const text = "The real issue is X.\nSomething \u2014 bad.";
    const violations = lintDraft(text);
    expect(violations.length).toBeGreaterThanOrEqual(2);
  });

  it("allows regular hyphens in compound words", () => {
    const text = "Multi-factor authentication is important.";
    expect(lintDraft(text)).toEqual([]);
  });

  it("does not flag hyphens without surrounding spaces", () => {
    expect(lintDraft("state-of-the-art technology")).toEqual([]);
    expect(lintDraft("well-known vulnerability")).toEqual([]);
  });

  it("includes snippet in violations", () => {
    const violations = lintDraft("This is \u2014 a problem.");
    expect(violations[0].snippet.length).toBeGreaterThan(0);
  });
});

// ─── applyDashReplaceMap ─────────────────────────────────────────

describe("applyDashReplaceMap", () => {
  it("replaces all entries in DASH_REPLACE_MAP", () => {
    for (const [from, to] of DASH_REPLACE_MAP) {
      expect(applyDashReplaceMap(`Use ${from} wisely.`)).toBe(`Use ${to} wisely.`);
    }
  });

  it("replaces multiple occurrences", () => {
    const text = "nation-state actors use nation-state tactics.";
    expect(applyDashReplaceMap(text)).toBe("nation state actors use nation state tactics.");
  });

  it("does not modify text without matches", () => {
    const text = "Normal text without special compounds.";
    expect(applyDashReplaceMap(text)).toBe(text);
  });

  it("handles empty string", () => {
    expect(applyDashReplaceMap("")).toBe("");
  });
});

// ─── DASH_REPLACE_MAP ────────────────────────────────────────────

describe("DASH_REPLACE_MAP", () => {
  it("contains expected compound-word entries", () => {
    const froms = DASH_REPLACE_MAP.map(([f]) => f);
    expect(froms).toContain("nation-state");
    expect(froms).toContain("real-time");
    expect(froms).toContain("machine-speed");
  });

  it("all entries are [string, string] tuples", () => {
    for (const entry of DASH_REPLACE_MAP) {
      expect(entry).toHaveLength(2);
      expect(typeof entry[0]).toBe("string");
      expect(typeof entry[1]).toBe("string");
    }
  });
});
