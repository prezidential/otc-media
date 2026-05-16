import type { CreatorBrandProfileUpsertPayload } from "@/lib/brand-profile/creatorBrandProfile";
import { idjTemplate } from "./idj";
import { blankTemplate } from "./blank";

/**
 * Brand-profile templates exposed by the onboarding wizard and the
 * `/api/brand-profiles/seed` endpoint.
 *
 * Each entry conforms to `CreatorBrandProfileUpsertPayload` (minus `id` and
 * `workspace_id`, which are assigned at insert time). Typing the registry against
 * the same union the validator uses keeps templates from silently drifting away
 * from the shape the brand-profile editor expects to load.
 *
 * Adding a new template = drop a new file in this directory, import it here, and
 * register it in `TEMPLATES`. The wizard reads the registry by id.
 */
export type CreatorBrandProfileTemplate = CreatorBrandProfileUpsertPayload;

export type TemplateId = "idj" | "blank";

export const TEMPLATES: Record<TemplateId, CreatorBrandProfileTemplate> = {
  idj: idjTemplate,
  blank: blankTemplate,
};

export function isTemplateId(value: unknown): value is TemplateId {
  return value === "idj" || value === "blank";
}

export function getTemplate(id: TemplateId): CreatorBrandProfileTemplate {
  return TEMPLATES[id];
}

/** Lightweight catalog for UI render lists. Description text is wizard copy. */
export const TEMPLATE_CATALOG: ReadonlyArray<{
  id: TemplateId;
  label: string;
  description: string;
}> = [
  {
    id: "idj",
    label: "Identity Jedi (cybersecurity newsletter)",
    description:
      "Editorial voice tuned for IAM and identity-security commentary. Direct, opinionated, jargon-free.",
  },
  {
    id: "blank",
    label: "Blank slate",
    description:
      "Empty defaults you fill in yourself. Good for non-IDJ creators or if you want to author the voice from scratch.",
  },
];
