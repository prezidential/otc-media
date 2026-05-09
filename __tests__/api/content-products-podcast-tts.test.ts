import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeJsonRequest } from "./helpers";

const mockResolveElevenLabsFromDraftBrand = vi.fn();
const mockPersistPodcastEpisodeAfterTts = vi.fn();
const mockSupabaseAdmin = vi.fn(() => ({ mock: "supabase" }));
const mockFetch = vi.fn();

vi.mock("@/lib/content-products/resolveElevenLabsVoice", () => ({
  resolveElevenLabsFromDraftBrand: (...args: unknown[]) => mockResolveElevenLabsFromDraftBrand(...args),
}));

vi.mock("@/lib/content-products/persistPodcastEpisode", () => ({
  persistPodcastEpisodeAfterTts: (...args: unknown[]) => mockPersistPodcastEpisodeAfterTts(...args),
}));

vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => mockSupabaseAdmin(),
}));

import { POST } from "@/app/api/content-products/podcast-tts/route";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", mockFetch);
  vi.stubEnv("WORKSPACE_ID", "ws-123");
  vi.stubEnv("PODCAST_AUDIO_STORAGE_BUCKET", "podcast-audio");
  vi.stubEnv("ELEVENLABS_API_KEY", "eleven-key");
  vi.stubEnv("ELEVENLABS_VOICE_ID", "env-voice");
  vi.stubEnv("ELEVENLABS_MODEL_ID", "env-model");

  mockResolveElevenLabsFromDraftBrand.mockResolvedValue({ voiceId: null, modelId: null });
  mockPersistPodcastEpisodeAfterTts.mockResolvedValue({
    ok: true,
    episodeId: "ep-1",
    storagePath: "ws-123/ep-1.mp3",
  });
  mockFetch.mockImplementation(() =>
    Promise.resolve(
      new Response(Uint8Array.from([1, 2, 3]), {
        status: 200,
        headers: { "Content-Type": "audio/mpeg" },
      })
    )
  );
});

describe("POST /api/content-products/podcast-tts", () => {
  it("returns 503 when ELEVENLABS_API_KEY is missing", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "");

    const res = await POST(
      makeJsonRequest("http://localhost:3000/api/content-products/podcast-tts", {
        fullText: "hello world",
      })
    );
    const json = await res.json();

    expect(res.status).toBe(503);
    expect(json.error).toBe("ELEVENLABS_API_KEY is not configured");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns 400 when no voice can be resolved", async () => {
    vi.stubEnv("ELEVENLABS_VOICE_ID", "");
    mockResolveElevenLabsFromDraftBrand.mockResolvedValueOnce({ voiceId: null, modelId: null });

    const res = await POST(
      makeJsonRequest("http://localhost:3000/api/content-products/podcast-tts", {
        draftId: "draft-1",
        fullText: "voice fallback check",
      })
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toContain("No ElevenLabs voice");
    expect(mockResolveElevenLabsFromDraftBrand).toHaveBeenCalledWith(
      expect.anything(),
      "ws-123",
      "draft-1"
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("chunks long text and uses brand-derived voice/model when body overrides are absent", async () => {
    vi.stubEnv("ELEVENLABS_VOICE_ID", "");
    mockResolveElevenLabsFromDraftBrand.mockResolvedValueOnce({
      voiceId: "brand-voice",
      modelId: "brand-model",
    });
    mockFetch.mockImplementation(() =>
      Promise.resolve(
        new Response(Uint8Array.from([7, 8]), {
          status: 200,
          headers: { "Content-Type": "audio/mpeg" },
        })
      )
    );
    const longText = Array.from({ length: 420 }, () => "token").join(" ");

    const res = await POST(
      makeJsonRequest("http://localhost:3000/api/content-products/podcast-tts", {
        draftId: "draft-22",
        fullText: longText,
      })
    );

    expect(res.status).toBe(200);
    const chunkCount = Number(res.headers.get("X-Podcast-Tts-Chunks"));
    expect(chunkCount).toBeGreaterThan(1);
    expect(mockFetch).toHaveBeenCalledTimes(chunkCount);

    for (const [url, init] of mockFetch.mock.calls) {
      expect(String(url)).toContain("/text-to-speech/brand-voice");
      const payload = JSON.parse(String((init as RequestInit).body));
      expect(payload.model_id).toBe("brand-model");
      expect(payload.text.length).toBeLessThanOrEqual(750);
    }

    const audio = new Uint8Array(await res.arrayBuffer());
    expect(audio.byteLength).toBe(chunkCount * 2);
  });

  it("prefers body.modelId over brand-derived model", async () => {
    vi.stubEnv("ELEVENLABS_VOICE_ID", "");
    mockResolveElevenLabsFromDraftBrand.mockResolvedValueOnce({
      voiceId: "brand-voice",
      modelId: "brand-model",
    });

    const res = await POST(
      makeJsonRequest("http://localhost:3000/api/content-products/podcast-tts", {
        draftId: "draft-77",
        modelId: "body-model",
        fullText: "single short chunk",
      })
    );

    expect(res.status).toBe(200);
    const firstPayload = JSON.parse(String((mockFetch.mock.calls[0][1] as RequestInit).body));
    expect(firstPayload.model_id).toBe("body-model");
  });

  it("persists audio metadata and episode headers when persist=true", async () => {
    const script = {
      working_title: "Identity Weekly",
      script_segments: [{ id: "intro", narrator_text: "Welcome to the show." }],
      outro_cta: "Thanks for listening.",
    };

    const res = await POST(
      makeJsonRequest("http://localhost:3000/api/content-products/podcast-tts", {
        draftId: "draft-9",
        persist: true,
        script,
        grounding: { resolvedCount: 2, unmatchedCount: 1 },
      })
    );

    expect(res.status).toBe(200);
    expect(mockPersistPodcastEpisodeAfterTts).toHaveBeenCalledTimes(1);
    const [, persistArgs] = mockPersistPodcastEpisodeAfterTts.mock.calls[0];
    expect(persistArgs).toMatchObject({
      workspaceId: "ws-123",
      draftId: "draft-9",
      script,
      grounding: { resolvedCount: 2, unmatchedCount: 1 },
      storageBucket: "podcast-audio",
      voiceId: "env-voice",
      modelId: "env-model",
    });
    expect(persistArgs.audio).toBeInstanceOf(Uint8Array);
    expect(persistArgs.audio.byteLength).toBe(3);
    expect(res.headers.get("X-Podcast-Persist-Status")).toBe("ok");
    expect(res.headers.get("X-Podcast-Episode-Id")).toBe("ep-1");
    expect(res.headers.get("X-Podcast-Storage-Path")).toBe("ws-123/ep-1.mp3");
  });
});
