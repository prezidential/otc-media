import type { CreatorBrandProfileUpsertPayload } from "@/lib/brand-profile/creatorBrandProfile";

/**
 * Blank-slate template — minimal valid CreatorBrandProfile.
 *
 * Every JSON field passes `validateCreatorBrandProfilePayload` (objects are
 * non-null plain objects, `forbidden_patterns_json` is an array). The values
 * themselves are intentionally neutral so a creator can fill them in via the
 * brand-profile editor after onboarding without first having to delete preset
 * content.
 */
export const blankTemplate: CreatorBrandProfileUpsertPayload = {
  name: "My Brand",
  voice_rules_json: {
    voice_name: "",
    tone: [],
    style: [],
    audience: [],
    stance: [],
  },
  formatting_rules_json: {
    paragraph_length: "",
    preferred_structures: [],
    avoid_structures: [],
  },
  forbidden_patterns_json: [],
  cta_rules_json: {
    default_cta: "",
    allowed_cta_styles: [],
    max_primary_ctas: 1,
  },
  emoji_policy_json: {
    allowed: false,
    allowed_emojis: [],
    guidance: "",
  },
  narrative_preferences_json: {
    core_thesis: [],
    recurring_angles: [],
    skepticism_triggers: [],
    language_constraints: {},
  },
  profile_version: "1.0",
};
