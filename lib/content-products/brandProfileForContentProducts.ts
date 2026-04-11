/**
 * Shared brand-profile slice for Phase 2 content-product prompts (social, etc.)
 * so copy matches the same JSON contract as issue generation.
 */

export type BrandProfileForContentProductsRow = {
  id: string;
  name: string;
  voice_rules_json: unknown;
  formatting_rules_json: unknown;
  forbidden_patterns_json: unknown;
  cta_rules_json: unknown;
  emoji_policy_json: unknown;
  narrative_preferences_json: unknown;
};

export function brandProfilePromptPayload(profile: BrandProfileForContentProductsRow) {
  return {
    name: profile.name,
    voice_rules_json: profile.voice_rules_json,
    formatting_rules_json: profile.formatting_rules_json,
    forbidden_patterns_json: profile.forbidden_patterns_json,
    cta_rules_json: profile.cta_rules_json,
    emoji_policy_json: profile.emoji_policy_json,
    narrative_preferences_json: profile.narrative_preferences_json,
  };
}

export function formatBrandProfileBlockForSocialPrompt(profile: BrandProfileForContentProductsRow): string {
  return `### Brand profile (same JSON fields as newsletter generation — follow strictly)
${JSON.stringify(brandProfilePromptPayload(profile), null, 2)}`;
}

/**
 * Prefer the draft's brand_profile_id; fall back to an explicit request body id (e.g. in-memory JSON on Issues).
 */
export function resolveBrandProfileIdForSocial(input: {
  draftBrandProfileId: string | null | undefined;
  bodyBrandProfileId: string | undefined;
}): string | null {
  const d = input.draftBrandProfileId;
  if (typeof d === "string" && d.trim()) return d.trim();
  const b = input.bodyBrandProfileId;
  if (typeof b === "string" && b.trim()) return b.trim();
  return null;
}
