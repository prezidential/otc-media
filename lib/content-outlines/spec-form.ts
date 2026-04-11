import { DEFAULT_INSIDER_OUTLINE, DEFAULT_NEWSLETTER_OUTLINE } from "./default-specs";
import {
  OUTLINE_KINDS,
  parseInsiderSpec,
  parseNewsletterSpec,
  type InsiderOutlineSpec,
  type OutlineKind,
  type NewsletterOutlineSpec,
} from "./types";

export const NEWSLETTER_USER_PLACEHOLDERS = [
  "PRIMARY_THESIS",
  "STEERING_BLOCK",
  "ANGLE_BLOCK",
  "LEADS_BLOCK",
  "PROMO_TEXT",
] as const;

export const INSIDER_USER_PLACEHOLDERS = [
  "PRIMARY_THESIS",
  "STEERING_BLOCK",
  "NEWSLETTER_SECTION",
  "ALLOWED_URLS",
  "LEADS_BLOCK",
] as const;

export type OutlineFormFields = {
  name: string;
  kind: OutlineKind;
  is_default: boolean;
  userPromptTemplate: string;
  /** Newsletter only */
  systemPromptSuffix: string;
  /** Insider only — maps to spec.systemPromptTemplate */
  insiderSystemPrompt: string;
};

export function specJsonToFormFields(kind: OutlineKind, specJson: unknown): OutlineFormFields {
  if (kind === "newsletter_issue") {
    const spec = parseNewsletterSpec(specJson, DEFAULT_NEWSLETTER_OUTLINE);
    return {
      name: "",
      kind,
      is_default: false,
      userPromptTemplate: spec.userPromptTemplate,
      systemPromptSuffix: spec.systemPromptSuffix,
      insiderSystemPrompt: "",
    };
  }
  const spec = parseInsiderSpec(specJson, DEFAULT_INSIDER_OUTLINE);
  return {
    name: "",
    kind,
    is_default: false,
    userPromptTemplate: spec.userPromptTemplate,
    systemPromptSuffix: "",
    insiderSystemPrompt: spec.systemPromptTemplate,
  };
}

export function formFieldsToSpecJson(fields: OutlineFormFields): NewsletterOutlineSpec | InsiderOutlineSpec {
  if (fields.kind === "newsletter_issue") {
    return {
      version: 1,
      userPromptTemplate: fields.userPromptTemplate.trim(),
      systemPromptSuffix: fields.systemPromptSuffix.trim(),
    };
  }
  return {
    version: 1,
    userPromptTemplate: fields.userPromptTemplate.trim(),
    systemPromptTemplate: fields.insiderSystemPrompt.trim(),
  };
}

function templateContainsPlaceholder(template: string, key: string): boolean {
  return template.includes(`{{${key}}}`);
}

/**
 * Non-blocking checks for save responses (warnings shown in UI).
 */
export function collectOutlineSpecWarnings(kind: OutlineKind, spec: NewsletterOutlineSpec | InsiderOutlineSpec): string[] {
  const warnings: string[] = [];
  if (kind === "newsletter_issue") {
    const s = spec as NewsletterOutlineSpec;
    for (const key of NEWSLETTER_USER_PLACEHOLDERS) {
      if (!templateContainsPlaceholder(s.userPromptTemplate, key)) {
        warnings.push(`User prompt template is missing placeholder {{${key}}}. Generation may misassemble the issue.`);
      }
    }
    if (!s.systemPromptSuffix.trim()) {
      warnings.push("System prompt suffix is empty; drafting may miss trailing rules.");
    }
  } else {
    const s = spec as InsiderOutlineSpec;
    for (const key of INSIDER_USER_PLACEHOLDERS) {
      if (!templateContainsPlaceholder(s.userPromptTemplate, key)) {
        warnings.push(`User prompt template is missing placeholder {{${key}}}. Insider assembly may be wrong.`);
      }
    }
    if (!s.systemPromptTemplate.trim()) {
      warnings.push("Insider system prompt is empty.");
    }
  }
  return warnings;
}

/**
 * Hard validation before insert/update.
 */
export function validateOutlineFormBody(body: Record<string, unknown>): { ok: true; fields: OutlineFormFields } | { ok: false; error: string } {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return { ok: false, error: "name is required" };
  const kind = body.kind as string;
  if (!OUTLINE_KINDS.includes(kind as OutlineKind)) return { ok: false, error: "kind must be newsletter_issue or insider_access" };
  const userPromptTemplate = typeof body.userPromptTemplate === "string" ? body.userPromptTemplate : "";
  if (!userPromptTemplate.trim()) return { ok: false, error: "userPromptTemplate is required" };

  const is_default = body.is_default === true;

  if (kind === "newsletter_issue") {
    const systemPromptSuffix = typeof body.systemPromptSuffix === "string" ? body.systemPromptSuffix : "";
    return {
      ok: true,
      fields: {
        name,
        kind: "newsletter_issue",
        is_default,
        userPromptTemplate,
        systemPromptSuffix,
        insiderSystemPrompt: "",
      },
    };
  }

  const insiderSystemPrompt = typeof body.insiderSystemPrompt === "string" ? body.insiderSystemPrompt : "";
  if (!insiderSystemPrompt.trim()) return { ok: false, error: "insiderSystemPrompt is required for insider_access" };

  return {
    ok: true,
    fields: {
      name,
      kind: "insider_access",
      is_default,
      userPromptTemplate,
      systemPromptSuffix: "",
      insiderSystemPrompt,
    },
  };
}
