/**
 * Workspace-owned outline specs. Brand profile supplies voice; outline supplies structure/instructions.
 * spec_json is validated loosely at runtime and merged with code defaults for missing keys.
 */

export const OUTLINE_KINDS = ["newsletter_issue", "insider_access"] as const;
export type OutlineKind = (typeof OUTLINE_KINDS)[number];

export type NewsletterOutlineSpec = {
  version: 1;
  /** User message with placeholders {{PRIMARY_THESIS}}, {{STEERING_BLOCK}}, {{ANGLE_BLOCK}}, {{LEADS_BLOCK}}, {{PROMO_TEXT}} */
  userPromptTemplate: string;
  /** Appended after the brand profile JSON in the drafting system prompt */
  systemPromptSuffix: string;
};

export type InsiderOutlineSpec = {
  version: 1;
  /** User message with {{PRIMARY_THESIS}}, {{STEERING_BLOCK}}, {{NEWSLETTER_JSON}}, {{ALLOWED_URLS}}, {{LEADS_BLOCK}} */
  userPromptTemplate: string;
  systemPromptTemplate: string;
};

export function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

export function parseNewsletterSpec(raw: unknown, fallback: NewsletterOutlineSpec): NewsletterOutlineSpec {
  if (!isRecord(raw)) return fallback;
  if (raw.version !== 1) return fallback;
  const userPromptTemplate =
    typeof raw.userPromptTemplate === "string" && raw.userPromptTemplate.trim()
      ? raw.userPromptTemplate
      : fallback.userPromptTemplate;
  const systemPromptSuffix =
    typeof raw.systemPromptSuffix === "string" ? raw.systemPromptSuffix : fallback.systemPromptSuffix;
  return { version: 1, userPromptTemplate, systemPromptSuffix };
}

export function parseInsiderSpec(raw: unknown, fallback: InsiderOutlineSpec): InsiderOutlineSpec {
  if (!isRecord(raw)) return fallback;
  if (raw.version !== 1) return fallback;
  const userPromptTemplate =
    typeof raw.userPromptTemplate === "string" && raw.userPromptTemplate.trim()
      ? raw.userPromptTemplate
      : fallback.userPromptTemplate;
  const systemPromptTemplate =
    typeof raw.systemPromptTemplate === "string" && raw.systemPromptTemplate.trim()
      ? raw.systemPromptTemplate
      : fallback.systemPromptTemplate;
  return { version: 1, userPromptTemplate, systemPromptTemplate };
}

export function fillTemplate(template: string, vars: Record<string, string>): string {
  let out = template;
  for (const [key, value] of Object.entries(vars)) {
    out = out.split(`{{${key}}}`).join(value);
  }
  return out;
}
