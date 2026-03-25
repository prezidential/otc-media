import { describe, expect, it } from "vitest";
import {
  collectOutlineSpecWarnings,
  formFieldsToSpecJson,
  validateOutlineFormBody,
} from "@/lib/content-outlines/spec-form";

const fullNewsletterTemplate = [
  "{{PRIMARY_THESIS}}",
  "{{STEERING_BLOCK}}",
  "{{ANGLE_BLOCK}}",
  "{{LEADS_BLOCK}}",
  "{{PROMO_TEXT}}",
].join(" ");

const fullInsiderTemplate = [
  "{{PRIMARY_THESIS}}",
  "{{STEERING_BLOCK}}",
  "{{NEWSLETTER_SECTION}}",
  "{{ALLOWED_URLS}}",
  "{{LEADS_BLOCK}}",
].join(" ");

describe("validateOutlineFormBody", () => {
  it("rejects empty name", () => {
    const r = validateOutlineFormBody({
      name: "  ",
      kind: "newsletter_issue",
      userPromptTemplate: fullNewsletterTemplate,
      systemPromptSuffix: "rules",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/name/);
  });

  it("accepts a valid newsletter body", () => {
    const r = validateOutlineFormBody({
      name: "Test",
      kind: "newsletter_issue",
      userPromptTemplate: fullNewsletterTemplate,
      systemPromptSuffix: "suffix here",
      is_default: true,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.fields.kind).toBe("newsletter_issue");
      expect(r.fields.is_default).toBe(true);
    }
  });

  it("requires insiderSystemPrompt for insider_access", () => {
    const r = validateOutlineFormBody({
      name: "Insider",
      kind: "insider_access",
      userPromptTemplate: fullInsiderTemplate,
      insiderSystemPrompt: "",
    });
    expect(r.ok).toBe(false);
  });
});

describe("formFieldsToSpecJson", () => {
  it("maps newsletter fields to spec_json shape", () => {
    const spec = formFieldsToSpecJson({
      name: "x",
      kind: "newsletter_issue",
      is_default: false,
      userPromptTemplate: "  hello  ",
      systemPromptSuffix: "  tail  ",
      insiderSystemPrompt: "",
    });
    expect(spec).toMatchObject({
      version: 1,
      userPromptTemplate: "hello",
      systemPromptSuffix: "tail",
    });
  });

  it("maps insider fields to systemPromptTemplate", () => {
    const spec = formFieldsToSpecJson({
      name: "x",
      kind: "insider_access",
      is_default: false,
      userPromptTemplate: "u",
      systemPromptSuffix: "",
      insiderSystemPrompt: "  sys  ",
    });
    expect(spec).toMatchObject({
      version: 1,
      userPromptTemplate: "u",
      systemPromptTemplate: "sys",
    });
  });
});

describe("collectOutlineSpecWarnings", () => {
  it("returns empty when newsletter template is complete", () => {
    const spec = formFieldsToSpecJson({
      name: "n",
      kind: "newsletter_issue",
      is_default: false,
      userPromptTemplate: fullNewsletterTemplate,
      systemPromptSuffix: "ok",
      insiderSystemPrompt: "",
    });
    expect(collectOutlineSpecWarnings("newsletter_issue", spec)).toEqual([]);
  });

  it("warns on missing placeholders", () => {
    const spec = formFieldsToSpecJson({
      name: "n",
      kind: "newsletter_issue",
      is_default: false,
      userPromptTemplate: "{{PRIMARY_THESIS}} only",
      systemPromptSuffix: "x",
      insiderSystemPrompt: "",
    });
    const w = collectOutlineSpecWarnings("newsletter_issue", spec);
    expect(w.length).toBeGreaterThan(0);
    expect(w.some((x) => x.includes("STEERING_BLOCK"))).toBe(true);
  });
});
