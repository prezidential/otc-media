import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeJsonRequest } from "./helpers";

const mockResolveElevenLabsFromDraftBrand = vi.fn();
const mockPersistPodcastEpisodeAfterTts = vi.fn();
const mockSupabaseAdmin = vi.fn();

vi.mock("@/lib/content-products/resolveElevenLabsVoice", () => ({
  resolveElevenLabsFromDraftBrand: (...args: unknown[]) => mockResolveElevenLabsFromDraftBrand(...args),
}));

vi.mock("@/lib/content-products/persistPodcastEpisode", () => ({
  persistPodcastEpisodeAfterTts: (...args: unknown[]) => mockPersistPodcastEpisodeAfterTts(...args),
}));

vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: (...args: unknown[]) => mockSupabaseAdmin(...args),
}));

import { POST } from "@/app/api/content-products/podcast-tts/route";

const originalFetch = globalThis.fetch;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("WORKSPACE_ID", "ws-123");
  vi.stubEnv("PODCAST_AUDIO_STORAGE_BUCKET", "podcast-audio");
  vi.stubEnv("ELEVENLABS_API_KEY", "eleven-key");
  vi.stubEnv("ELEVENLABS_VOICE_ID", "");
  vi.stubEnv("ELEVENLABS_MODEL_ID", "default-model");

  mockSupabaseAdmin.mockReturnValue({ mocked: true });
  mockResolveElevenLabsFromDraftBrand.mockResolvedValue({ voiceId: null, modelId: null });
  mockPersistPodcastEpisodeAfterTts.mockResolvedValue({
    ok: true,
    episodeId: "episode-1",
    storagePath: "ws-123/episode-1.mp3",
  });
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.unstubAllEnvs();
});

describe("POST /api/content-products/podcast-tts", () => {
  it("returns 400 when no voice can be resolved", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as typeof fetch;

    const res = await POST(
      makeJsonRequest("http://localhost:3000/api/content-products/podcast-tts", {
        fullText: "hello world",
        draftId: "draft-1",
      })
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.ok).toBe(false);
    expect(json.error).toContain("No ElevenLabs voice");
    expect(mockResolveElevenLabsFromDraftBrand).toHaveBeenCalledWith({ mocked: true }, "ws-123", "draft-1");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses brand voice and model and chunks long narration text", async () => {
    mockResolveElevenLabsFromDraftBrand.mockResolvedValueOnce({
      voiceId: "brand-voice",
      modelId: "brand-model",
    });

    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(Uint8Array.from([1, 2, 3]), {
          status: 200,
          headers: { "Content-Type": "audio/mpeg" },
        })
      )
    );
    globalThis.fetch = fetchMock as typeof fetch;

    const paragraph = "a".repeat(500);
    const longText = `${paragraph}\n\n${paragraph}\n\n${paragraph}`;

    const res = await POST(
      makeJsonRequest("http://localhost:3000/api/content-products/podcast-tts", {
        fullText: longText,
        draftId: "draft-1",
      })
    );
    const audio = await res.arrayBuffer();

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("audio/mpeg");
    expect(res.headers.get("X-Podcast-Tts-Chunks")).toBe("3");
    expect(audio.byteLength).toBe(9);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(mockPersistPodcastEpisodeAfterTts).not.toHaveBeenCalled();

    const firstCall = fetchMock.mock.calls[0] as [string, RequestInit];
    const firstBody = JSON.parse(String(firstCall[1].body));
    expect(firstCall[0]).toContain("/text-to-speech/brand-voice");
    expect(firstBody.model_id).toBe("brand-model");
    expect((firstBody.text as string).length).toBeLessThanOrEqual(750);
  });

  it("keeps user-provided modelId and sets persist failure headers", async () => {
    mockResolveElevenLabsFromDraftBrand.mockResolvedValueOnce({
      voiceId: "brand-voice",
      modelId: "brand-model",
    });
    mockPersistPodcastEpisodeAfterTts.mockResolvedValueOnce({
      ok: false,
      error: "Storage upload failed hard",
      episodeId: "episode-9",
    });

    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(Uint8Array.from([9, 9]), {
          status: 200,
          headers: { "Content-Type": "audio/mpeg" },
        })
      )
    );
    globalThis.fetch = fetchMock as typeof fetch;

    const res = await POST(
      makeJsonRequest("http://localhost:3000/api/content-products/podcast-tts", {
        draftId: "draft-1",
        persist: true,
        modelId: "custom-model",
        fullText: "A short episode chunk.",
        script: {
          working_title: "Episode",
          script_segments: [{ id: "intro", narrator_text: "Hello there." }],
          outro_cta: "Subscribe.",
        },
        grounding: { resolvedCount: 3, unmatchedCount: 1 },
      })
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("X-Podcast-Tts-Chunks")).toBe("1");
    expect(res.headers.get("X-Podcast-Persist-Status")).toBe("failed");
    expect(res.headers.get("X-Podcast-Persist-Error")).toBe("Storage upload failed hard");
    expect(res.headers.get("X-Podcast-Episode-Id")).toBe("episode-9");
    expect(mockPersistPodcastEpisodeAfterTts).toHaveBeenCalledTimes(1);

    const persistCall = mockPersistPodcastEpisodeAfterTts.mock.calls[0] as [
      unknown,
      { modelId: string; voiceId: string; audio: Uint8Array; draftId: string }
    ];
    expect(persistCall[1].voiceId).toBe("brand-voice");
    expect(persistCall[1].modelId).toBe("custom-model");
    expect(persistCall[1].draftId).toBe("draft-1");
    expect(persistCall[1].audio).toBeInstanceOf(Uint8Array);
    expect(persistCall[1].audio.byteLength).toBe(2);

    const firstCall = fetchMock.mock.calls[0] as [string, RequestInit];
    const firstBody = JSON.parse(String(firstCall[1].body));
    expect(firstBody.model_id).toBe("custom-model");
  });
});
