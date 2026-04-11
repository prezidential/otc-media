import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Resolve ElevenLabs voice/model for podcast-tts: draft's brand_profile row, if columns set.
 */
export async function resolveElevenLabsFromDraftBrand(
  supabase: SupabaseClient,
  workspaceId: string,
  draftId: string
): Promise<{ voiceId: string | null; modelId: string | null }> {
  const { data: draft, error: dErr } = await supabase
    .from("issue_drafts")
    .select("brand_profile_id")
    .eq("id", draftId.trim())
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (dErr || !draft?.brand_profile_id) {
    return { voiceId: null, modelId: null };
  }

  const bpId = draft.brand_profile_id as string;
  const { data: profile, error: pErr } = await supabase
    .from("brand_profiles")
    .select("elevenlabs_voice_id, elevenlabs_model_id")
    .eq("id", bpId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (pErr || !profile) {
    return { voiceId: null, modelId: null };
  }

  const voiceId =
    typeof profile.elevenlabs_voice_id === "string" && profile.elevenlabs_voice_id.trim()
      ? profile.elevenlabs_voice_id.trim()
      : null;
  const modelId =
    typeof profile.elevenlabs_model_id === "string" && profile.elevenlabs_model_id.trim()
      ? profile.elevenlabs_model_id.trim()
      : null;

  return { voiceId, modelId };
}
