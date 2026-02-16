import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

const DEFAULT_IDJ_PROFILE = {
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
      "avoid generic security commentary"
    ]
  },
  formatting_rules_json: {
    paragraph_length: "3-4 sentences",
    preferred_structures: [
      "Strong opening line",
      "What it means",
      "Why it matters to identity security",
      "Practical implication"
    ],
    avoid_structures: [
      "this isn’t X, it’s Y",
      "forced metaphors",
      "repetitive hooks"
    ]
  },
  forbidden_patterns_json: [
    "Here’s the thing",
    "The truth is",
    "In today’s digital world",
    "Now more than ever",
    "At the end of the day",
    "synergy",
    "drive value",
    "empower"
  ],
  cta_rules_json: {
    default_cta: "Subscribe",
    allowed_cta_styles: ["short", "direct", "no hype"],
    max_primary_ctas: 1
  },
  emoji_policy_json: {
    allowed: true,
    allowed_emojis: ["🏾"],
    guidance: "Use sparingly and only when natural. Brown-skin emojis only."
  },
  narrative_preferences_json: {
    core_thesis: [
      "Identity is the security control plane.",
      "Identity Security is broader than IAM.",
      "Most identity programs are confused, not broken.",
      "Governance failures are design failures."
    ],
    recurring_angles: [
      "Non-human identities are under-governed and under-priced risk.",
      "Migrations fail because process and operating models are ignored.",
      "AI agents multiply identity risk and decision speed.",
      "Telemetry without governance just creates faster chaos."
    ],
    skepticism_triggers: [
      "Vendor claims without operational reality",
      "Overreliance on tools to fix design problems",
      "Anything that assumes perfect data hygiene"
    ],
    language_constraints: {
      avoid_dashes_in_sentences: true,
      avoid_this_isnt_its_pattern: true
    }
  },
  profile_version: "1.0"
};

export async function POST() {
  const workspaceId = process.env.WORKSPACE_ID!;
  const supabase = supabaseAdmin();

  const { data: existing, error: fetchError } = await supabase
    .from("brand_profiles")
    .select("id")
    .eq("workspace_id", workspaceId)
    .limit(1);

  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
  if (existing && existing.length > 0) return NextResponse.json({ inserted: 0 });

  const { data: inserted, error: insertError } = await supabase
    .from("brand_profiles")
    .insert({
      workspace_id: workspaceId,
      name: DEFAULT_IDJ_PROFILE.name,
      voice_rules_json: DEFAULT_IDJ_PROFILE.voice_rules_json,
      formatting_rules_json: DEFAULT_IDJ_PROFILE.formatting_rules_json,
      forbidden_patterns_json: DEFAULT_IDJ_PROFILE.forbidden_patterns_json,
      cta_rules_json: DEFAULT_IDJ_PROFILE.cta_rules_json,
      emoji_policy_json: DEFAULT_IDJ_PROFILE.emoji_policy_json,
      narrative_preferences_json: DEFAULT_IDJ_PROFILE.narrative_preferences_json,
      profile_version: DEFAULT_IDJ_PROFILE.profile_version,
    })
    .select("id")
    .single();

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
  return NextResponse.json({ inserted: inserted ? 1 : 0 });
}
