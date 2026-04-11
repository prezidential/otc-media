/**
 * CreatorBrandProfile — validated payload for brand_profiles rows (Phase 2A slice).
 * JSON columns match existing newsletter / content-product prompts.
 */

export type CreatorBrandProfileRow = {
  id: string;
  workspace_id: string;
  name: string;
  voice_rules_json: unknown;
  formatting_rules_json: unknown;
  forbidden_patterns_json: unknown;
  cta_rules_json: unknown;
  emoji_policy_json: unknown;
  narrative_preferences_json: unknown;
  profile_version: string | null;
  elevenlabs_voice_id: string | null;
  elevenlabs_model_id: string | null;
  created_at: string;
};

export type CreatorBrandProfileUpsertPayload = {
  name: string;
  voice_rules_json: unknown;
  formatting_rules_json: unknown;
  forbidden_patterns_json: unknown;
  cta_rules_json: unknown;
  emoji_policy_json: unknown;
  narrative_preferences_json: unknown;
  profile_version?: string | null;
  elevenlabs_voice_id?: string | null;
  elevenlabs_model_id?: string | null;
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

export function validateCreatorBrandProfilePayload(
  body: unknown
): { ok: true; value: CreatorBrandProfileUpsertPayload } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (!body || typeof body !== "object") {
    return { ok: false, errors: ["Body must be a JSON object"] };
  }
  const b = body as Record<string, unknown>;

  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (!name) errors.push("name is required");

  const voice = b.voice_rules_json;
  if (!isPlainObject(voice)) errors.push("voice_rules_json must be an object");

  const formatting = b.formatting_rules_json;
  if (!isPlainObject(formatting)) errors.push("formatting_rules_json must be an object");

  const forbidden = b.forbidden_patterns_json;
  if (!Array.isArray(forbidden)) errors.push("forbidden_patterns_json must be an array");

  const cta = b.cta_rules_json;
  if (!isPlainObject(cta)) errors.push("cta_rules_json must be an object");

  const emoji = b.emoji_policy_json;
  if (!isPlainObject(emoji)) errors.push("emoji_policy_json must be an object");

  const narrative = b.narrative_preferences_json;
  if (!isPlainObject(narrative)) errors.push("narrative_preferences_json must be an object");

  const profile_version =
    b.profile_version === undefined || b.profile_version === null
      ? null
      : typeof b.profile_version === "string"
        ? b.profile_version.trim() || null
        : (errors.push("profile_version must be a string if set"), null);

  const trimOrNull = (k: string): string | null => {
    const v = b[k];
    if (v === undefined || v === null || v === "") return null;
    if (typeof v !== "string") {
      errors.push(`${k} must be a string if set`);
      return null;
    }
    return v.trim() || null;
  };

  const elevenlabs_voice_id = trimOrNull("elevenlabs_voice_id");
  const elevenlabs_model_id = trimOrNull("elevenlabs_model_id");

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      name,
      voice_rules_json: voice,
      formatting_rules_json: formatting,
      forbidden_patterns_json: forbidden,
      cta_rules_json: cta,
      emoji_policy_json: emoji,
      narrative_preferences_json: narrative,
      profile_version,
      elevenlabs_voice_id,
      elevenlabs_model_id,
    },
  };
}

/** Safe JSON fields for API responses (full editor shape). */
export function serializeBrandProfileForApi(row: CreatorBrandProfileRow) {
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    name: row.name,
    voice_rules_json: row.voice_rules_json,
    formatting_rules_json: row.formatting_rules_json,
    forbidden_patterns_json: row.forbidden_patterns_json,
    cta_rules_json: row.cta_rules_json,
    emoji_policy_json: row.emoji_policy_json,
    narrative_preferences_json: row.narrative_preferences_json,
    profile_version: row.profile_version,
    elevenlabs_voice_id: row.elevenlabs_voice_id,
    elevenlabs_model_id: row.elevenlabs_model_id,
    created_at: row.created_at,
  };
}
