import { describe, expect, it, vi } from "vitest";
import { persistPodcastEpisodeAfterTts } from "@/lib/content-products/persistPodcastEpisode";
import type { PodcastScript } from "@/lib/content-products/podcastScriptTypes";

type QueryResult = { data: unknown; error: { message: string } | null };

function createQueryBuilder(result: QueryResult) {
  const chain = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue(result),
    single: vi.fn().mockResolvedValue(result),
    insert: vi.fn(),
    update: vi.fn(),
  };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.insert.mockReturnValue(chain);
  chain.update.mockReturnValue(chain);
  return chain;
}

function createSupabaseMock(config: {
  draftQuery: QueryResult;
  insertQuery: QueryResult;
  updateResults?: QueryResult[];
  uploadResult?: { error: { message: string } | null };
}) {
  const issueDraftsChain = createQueryBuilder(config.draftQuery);
  const insertChain = createQueryBuilder(config.insertQuery);
  const updateResults = [...(config.updateResults ?? [])];
  const updateCalls: Array<Record<string, unknown>> = [];

  const podcastEpisodesChain = {
    insert: vi.fn().mockReturnValue(insertChain),
    update: vi.fn((payload: Record<string, unknown>) => {
      updateCalls.push(payload);
      const result = updateResults.shift() ?? { data: null, error: null };
      return {
        eq: vi.fn().mockResolvedValue(result),
      };
    }),
  };

  const upload = vi.fn().mockResolvedValue(config.uploadResult ?? { error: null });
  const from = vi.fn((table: string) => {
    if (table === "issue_drafts") return issueDraftsChain;
    if (table === "podcast_episodes") return podcastEpisodesChain;
    throw new Error(`Unexpected table ${table}`);
  });
  const storage = {
    from: vi.fn(() => ({ upload })),
  };

  return {
    supabase: {
      from,
      storage,
    },
    issueDraftsChain,
    insertChain,
    podcastEpisodesChain,
    updateCalls,
    upload,
  };
}

const script: PodcastScript = {
  working_title: "Identity Pulse",
  script_segments: [{ id: "intro", narrator_text: "Welcome back." }],
  outro_cta: "See you next week.",
};

describe("persistPodcastEpisodeAfterTts", () => {
  it("returns error when draft lookup fails", async () => {
    const { supabase } = createSupabaseMock({
      draftQuery: { data: null, error: { message: "draft query failed" } },
      insertQuery: { data: null, error: null },
    });

    const result = await persistPodcastEpisodeAfterTts(supabase as never, {
      workspaceId: "ws-1",
      draftId: "draft-1",
      script,
      grounding: null,
      audio: new Uint8Array([1, 2, 3]),
      storageBucket: "audio",
      voiceId: "voice-1",
      modelId: "model-1",
    });

    expect(result).toEqual({ ok: false, error: "draft query failed" });
  });

  it("returns not found when draft is missing for workspace", async () => {
    const { supabase } = createSupabaseMock({
      draftQuery: { data: null, error: null },
      insertQuery: { data: null, error: null },
    });

    const result = await persistPodcastEpisodeAfterTts(supabase as never, {
      workspaceId: "ws-1",
      draftId: "draft-1",
      script,
      grounding: null,
      audio: new Uint8Array([1, 2, 3]),
      storageBucket: "audio",
      voiceId: "voice-1",
      modelId: "model-1",
    });

    expect(result).toEqual({ ok: false, error: "Draft not found for this workspace" });
  });

  it("saves script, uploads audio, and marks episode audio_ready", async () => {
    const { supabase, issueDraftsChain, podcastEpisodesChain, updateCalls, upload } = createSupabaseMock({
      draftQuery: {
        data: { id: "draft-1", brand_profile_id: "bp-7" },
        error: null,
      },
      insertQuery: {
        data: { id: "episode-9" },
        error: null,
      },
      updateResults: [{ data: null, error: null }],
    });

    const audio = new Uint8Array([10, 20, 30, 40]);
    const result = await persistPodcastEpisodeAfterTts(supabase as never, {
      workspaceId: "ws-1",
      draftId: " draft-1 ",
      script,
      grounding: { resolvedCount: 2, unmatchedCount: 1 },
      audio,
      storageBucket: "podcast-audio",
      voiceId: "voice-1",
      modelId: "model-1",
    });

    expect(result).toEqual({
      ok: true,
      episodeId: "episode-9",
      storagePath: "ws-1/episode-9.mp3",
    });
    expect(issueDraftsChain.eq).toHaveBeenCalledWith("id", "draft-1");
    expect(podcastEpisodesChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        workspace_id: "ws-1",
        issue_draft_id: "draft-1",
        brand_profile_id: "bp-7",
        status: "script_saved",
        tts_provider: "elevenlabs",
        elevenlabs_voice_id: "voice-1",
        elevenlabs_model_id: "model-1",
      })
    );
    expect(upload).toHaveBeenCalledWith(
      "ws-1/episode-9.mp3",
      expect.any(Buffer),
      expect.objectContaining({ contentType: "audio/mpeg", upsert: true })
    );
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0]).toMatchObject({
      audio_storage_bucket: "podcast-audio",
      audio_storage_path: "ws-1/episode-9.mp3",
      audio_byte_length: 4,
      audio_content_type: "audio/mpeg",
      status: "audio_ready",
    });
  });

  it("marks episode failed and returns error when upload fails", async () => {
    const { supabase, updateCalls } = createSupabaseMock({
      draftQuery: {
        data: { id: "draft-1", brand_profile_id: null },
        error: null,
      },
      insertQuery: {
        data: { id: "episode-9" },
        error: null,
      },
      updateResults: [{ data: null, error: null }],
      uploadResult: { error: { message: "bucket unavailable" } },
    });

    const result = await persistPodcastEpisodeAfterTts(supabase as never, {
      workspaceId: "ws-1",
      draftId: "draft-1",
      script,
      grounding: null,
      audio: new Uint8Array([1, 2]),
      storageBucket: "podcast-audio",
      voiceId: "voice-1",
      modelId: "model-1",
    });

    expect(result).toEqual({
      ok: false,
      error: "bucket unavailable",
      episodeId: "episode-9",
    });
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0]).toMatchObject({
      status: "failed",
      tts_error: "Storage upload: bucket unavailable",
    });
  });

  it("returns update error when final audio_ready update fails", async () => {
    const { supabase, updateCalls } = createSupabaseMock({
      draftQuery: {
        data: { id: "draft-1", brand_profile_id: "bp-1" },
        error: null,
      },
      insertQuery: {
        data: { id: "episode-9" },
        error: null,
      },
      updateResults: [{ data: null, error: { message: "update failed" } }],
    });

    const result = await persistPodcastEpisodeAfterTts(supabase as never, {
      workspaceId: "ws-1",
      draftId: "draft-1",
      script,
      grounding: null,
      audio: new Uint8Array([7]),
      storageBucket: "podcast-audio",
      voiceId: "voice-1",
      modelId: "model-1",
    });

    expect(result).toEqual({
      ok: false,
      error: "update failed",
      episodeId: "episode-9",
    });
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0]).toMatchObject({ status: "audio_ready" });
  });
});
