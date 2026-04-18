import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeJsonRequest } from "./helpers";

const mockResolveElevenLabsFromDraftBrand = vi.fn();
const mockPersistPodcastEpisodeAfterTts = vi.fn();
const mockSupabase = {};

vi.mock("@/lib/content-products/resolveElevenLabsVoice", () => ({
  resolveElevenLabsFromDraftBrand: (...args: unknown[]) =>
    mockResolveElevenLabsFromDraftBrand(...args),
}));

vi.mock("@/lib/content-products/persistPodcastEpisode", () => ({
  persistPodcastEpisodeAfterTts: (...args: unknown[]) => mockPersistPodcastEpisodeAfterTts(...args),
}));

vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => mockSupabase,
}));

import { POST } from "@/app/api/content-products/podcast-tts/route";

function mockAudioFetch(responses: Array<{ bytes: number[]; ok?: boolean; status?: number; text?: string }>) {
  const fetchMock = vi
    .fn()
    .mockImplementationOnce(async () => ({
      ok: responses[0]?.ok ?? true,
      status: responses[0]?.status ?? 200,
      statusText: "OK",
      arrayBuffer: async () => Uint8Array.from(responses[0]?.bytes ?? []).buffer,
      text: async () => responses[0]?.text ?? "",
    }));

  for (let i = 1; i < responses.length; i += 1) {
    fetchMock.mockImplementationOnce(async () => ({
      ok: responses[i]?.ok ?? true,
      status: responses[i]?.status ?? 200,
      statusText: "OK",
      arrayBuffer: async () => Uint8Array.from(responses[i]?.bytes ?? []).buffer,
      text: async () => responses[i]?.text ?? "",
    }));
  }

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("ELEVENLABS_API_KEY", "key-123");
  vi.stubEnv("ELEVENLABS_VOICE_ID", "voice-default");
  vi.stubEnv("ELEVENLABS_MODEL_ID", "eleven_turbo_v2_5");
  vi.stubEnv("WORKSPACE_ID", "ws-123");
  vi.stubEnv("PODCAST_AUDIO_STORAGE_BUCKET", "podcast-audio");

  mockResolveElevenLabsFromDraftBrand.mockResolvedValue({ voiceId: null, modelId: null });
  mockPersistPodcastEpisodeAfterTts.mockResolvedValue({
    ok: true,
    episodeId: "ep-1",
    storagePath: "ws-123/ep-1.mp3",
  });
});

describe("POST /api/content-products/podcast-tts", () => {
  it("chunks long narration and merges returned audio in order", async () => {
    const paraA = "A".repeat(380);
    const paraB = "B".repeat(380);
    const paraC = "C".repeat(380);
    const fullText = `${paraA}\n\n${paraB}\n\n${paraC}`;

    const fetchMock = mockAudioFetch([
      { bytes: [1, 2] },
      { bytes: [3, 4, 5] },
    ]);

    const res = await POST(makeJsonRequest("http://localhost:3000/api/content-products/podcast-tts", { fullText }));
    const audio = new Uint8Array(await res.arrayBuffer());

    expect(res.status).toBe(200);
    expect(res.headers.get("X-Podcast-Tts-Chunks")).toBe("2");
    expect(audio).toEqual(Uint8Array.from([1, 2, 3, 4, 5]));
    expect(fetchMock).toHaveBeenCalledTimes(2);

    for (const [url, init] of fetchMock.mock.calls) {
      expect(url).toContain("/text-to-speech/voice-default");
      const body = JSON.parse(String(init?.body));
      expect(body.text.length).toBeLessThanOrEqual(750);
      expect(body.model_id).toBe("eleven_turbo_v2_5");
    }
  });

  it("uses brand-resolved voice and model when body voice/model are missing", async () => {
    vi.stubEnv("ELEVENLABS_VOICE_ID", "");
    mockResolveElevenLabsFromDraftBrand.mockResolvedValue({
      voiceId: "voice-from-brand",
      modelId: "eleven-multilingual-v2",
    });
    const fetchMock = mockAudioFetch([{ bytes: [9] }]);

    const res = await POST(
      makeJsonRequest("http://localhost:3000/api/content-products/podcast-tts", {
        draftId: "draft-42",
        fullText: "hello world",
      })
    );

    expect(res.status).toBe(200);
    expect(mockResolveElevenLabsFromDraftBrand).toHaveBeenCalledWith(mockSupabase, "ws-123", "draft-42");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toContain("/text-to-speech/voice-from-brand");
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body.model_id).toBe("eleven-multilingual-v2");
  });

  it("keeps explicit body modelId when brand has a fallback model", async () => {
    vi.stubEnv("ELEVENLABS_VOICE_ID", "");
    mockResolveElevenLabsFromDraftBrand.mockResolvedValue({
      voiceId: "voice-from-brand",
      modelId: "brand-model-ignored",
    });
    const fetchMock = mockAudioFetch([{ bytes: [7] }]);

    const res = await POST(
      makeJsonRequest("http://localhost:3000/api/content-products/podcast-tts", {
        draftId: "draft-42",
        fullText: "short",
        modelId: "explicit-model",
      })
    );

    expect(res.status).toBe(200);
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body.model_id).toBe("explicit-model");
  });

  it("returns 200 audio with persist failure headers when save fails", async () => {
    const fetchMock = mockAudioFetch([{ bytes: [1, 9, 9] }]);
    mockPersistPodcastEpisodeAfterTts.mockResolvedValueOnce({
      ok: false,
      error: "Storage upload: bucket unavailable",
      episodeId: "ep-9",
    });

    const res = await POST(
      makeJsonRequest("http://localhost:3000/api/content-products/podcast-tts", {
        persist: true,
        draftId: "draft-9",
        script: {
          working_title: "Episode",
          script_segments: [{ id: "s1", narrator_text: "segment text" }],
        },
      })
    );

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(res.headers.get("X-Podcast-Persist-Status")).toBe("failed");
    expect(res.headers.get("X-Podcast-Persist-Error")).toContain("bucket unavailable");
    expect(res.headers.get("X-Podcast-Episode-Id")).toBe("ep-9");
  });

  it("returns 502 when ElevenLabs synthesis fails", async () => {
    mockAudioFetch([{ bytes: [], ok: false, status: 429, text: "rate limited" }]);

    const res = await POST(
      makeJsonRequest("http://localhost:3000/api/content-products/podcast-tts", {
        fullText: "hello world",
      })
    );
    const json = await res.json();

    expect(res.status).toBe(502);
    expect(json.ok).toBe(false);
    expect(json.error).toContain("ElevenLabs 429");
    expect(json.error).toContain("rate limited");
  });
});
