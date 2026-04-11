import type { SupabaseClient } from "@supabase/supabase-js";
import type { PodcastScript } from "./podcastScriptTypes";

export type GroundingSnapshot = { resolvedCount: number; unmatchedCount: number };

/**
 * Saves script row, uploads MP3 to Storage, marks episode audio_ready (or failed on upload error).
 */
export async function persistPodcastEpisodeAfterTts(
  supabase: SupabaseClient,
  params: {
    workspaceId: string;
    draftId: string;
    script: PodcastScript;
    grounding: GroundingSnapshot | null;
    audio: Uint8Array;
    storageBucket: string;
    voiceId: string;
    modelId: string;
  }
): Promise<
  | { ok: true; episodeId: string; storagePath: string }
  | { ok: false; error: string; episodeId?: string }
> {
  const { workspaceId, draftId, script, grounding, audio, storageBucket, voiceId, modelId } = params;

  const { data: draft, error: draftErr } = await supabase
    .from("issue_drafts")
    .select("id, workspace_id, brand_profile_id")
    .eq("id", draftId.trim())
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (draftErr) {
    return { ok: false, error: draftErr.message };
  }
  if (!draft?.id) {
    return { ok: false, error: "Draft not found for this workspace" };
  }

  const scriptJson = JSON.parse(JSON.stringify(script)) as Record<string, unknown>;

  const { data: inserted, error: insertErr } = await supabase
    .from("podcast_episodes")
    .insert({
      workspace_id: workspaceId,
      issue_draft_id: draft.id,
      brand_profile_id: draft.brand_profile_id ?? null,
      script_json: scriptJson,
      grounding_json: grounding,
      tts_provider: "elevenlabs",
      elevenlabs_voice_id: voiceId,
      elevenlabs_model_id: modelId,
      status: "script_saved",
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (insertErr || !inserted?.id) {
    return { ok: false, error: insertErr?.message ?? "podcast_episodes insert failed" };
  }

  const episodeId = inserted.id as string;
  const storagePath = `${workspaceId}/${episodeId}.mp3`;
  const fileBytes = Buffer.from(audio);

  const { error: uploadErr } = await supabase.storage.from(storageBucket).upload(storagePath, fileBytes, {
    contentType: "audio/mpeg",
    upsert: true,
  });

  if (uploadErr) {
    await supabase
      .from("podcast_episodes")
      .update({
        status: "failed",
        tts_error: `Storage upload: ${uploadErr.message}`,
        updated_at: new Date().toISOString(),
      })
      .eq("id", episodeId);
    return { ok: false, error: uploadErr.message, episodeId };
  }

  const { error: updateErr } = await supabase
    .from("podcast_episodes")
    .update({
      audio_storage_bucket: storageBucket,
      audio_storage_path: storagePath,
      audio_byte_length: audio.byteLength,
      audio_content_type: "audio/mpeg",
      status: "audio_ready",
      updated_at: new Date().toISOString(),
    })
    .eq("id", episodeId);

  if (updateErr) {
    return { ok: false, error: updateErr.message, episodeId };
  }

  return { ok: true, episodeId, storagePath };
}
