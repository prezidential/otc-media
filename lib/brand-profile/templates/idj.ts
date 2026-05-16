import type { CreatorBrandProfileUpsertPayload } from "@/lib/brand-profile/creatorBrandProfile";

/**
 * Identity Jedi cybersecurity-newsletter template.
 *
 * Lifted verbatim from the legacy `DEFAULT_IDJ_PROFILE` literal that used to live
 * inside `app/api/brand-profiles/seed/route.ts`. Keeping the exact JSON shape
 * preserved makes the M1 onboarding wizard a no-op for existing IDJ workspaces:
 * the rows it inserts are byte-identical to the v2.0 seed.
 */
export const idjTemplate: CreatorBrandProfileUpsertPayload = {
  name: "Identity Jedi Newsletter",
  voice_rules_json: {
    voice_name: "The Identity Jedi",
    tone: ["direct", "confident", "human", "practical", "editorial"],
    style: ["conversational", "tight sentences", "punchy"],
    audience: ["IAM leaders", "security practitioners", "technical executives"],
    stance: [
      "insightful without being preachy",
      "blunt when needed, never abrasive",
      "zero corporate jargon",
      "avoid generic security commentary",
    ],
  },
  formatting_rules_json: {
    paragraph_length: "3-4 sentences",
    preferred_structures: [
      "Strong opening line",
      "What it means",
      "Why it matters to identity security",
      "Practical implication",
    ],
    avoid_structures: [
      "this isn’t X, it’s Y",
      "forced metaphors",
      "repetitive hooks",
    ],
  },
  forbidden_patterns_json: [
    "Here’s the thing",
    "The truth is",
    "In today’s digital world",
    "Now more than ever",
    "At the end of the day",
    "synergy",
    "drive value",
    "empower",
  ],
  cta_rules_json: {
    default_cta: "Subscribe",
    allowed_cta_styles: ["short", "direct", "no hype"],
    max_primary_ctas: 1,
  },
  emoji_policy_json: {
    allowed: true,
    allowed_emojis: ["🏾"],
    guidance: "Use sparingly and only when natural. Brown-skin emojis only.",
  },
  narrative_preferences_json: {
    core_thesis: [
      "Identity is the security control plane.",
      "Identity Security is broader than IAM.",
      "Most identity programs are confused, not broken.",
      "Governance failures are design failures.",
    ],
    recurring_angles: [
      "Non-human identities are under-governed and under-priced risk.",
      "Migrations fail because process and operating models are ignored.",
      "AI agents multiply identity risk and decision speed.",
      "Telemetry without governance just creates faster chaos.",
    ],
    skepticism_triggers: [
      "Vendor claims without operational reality",
      "Overreliance on tools to fix design problems",
      "Anything that assumes perfect data hygiene",
    ],
    language_constraints: {
      avoid_dashes_in_sentences: true,
      avoid_this_isnt_its_pattern: true,
    },
  },
  profile_version: "1.0",
};
