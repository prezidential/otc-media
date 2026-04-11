import { NextResponse } from "next/server";
import { fullNarrationText, type PodcastScript } from "@/lib/content-products/podcastScriptTypes";
import { persistPodcastEpisodeAfterTts } from "@/lib/content-products/persistPodcastEpisode";
import { resolveElevenLabsFromDraftBrand } from "@/lib/content-products/resolveElevenLabsVoice";
import { supabaseAdmin } from "@/lib/supabase/server";

const ELEVEN_BASE = "https://api.elevenlabs.io/v1";
/** ElevenLabs per-request character guidance; chunk below this to reduce failures. */
const CHUNK_CHARS = 750;

function normalizeNewlines(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

/** Top-level semantic breaks: blank-line-separated paragraphs (preserves single `\n` inside a paragraph). */
function splitIntoParagraphs(text: string): string[] {
  const t = normalizeNewlines(text).trim();
  if (!t) return [];
  return t
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function hardSplitAtWordBoundary(s: string, maxChars: number): string[] {
  const chunks: string[] = [];
  let rest = s.trim();
  while (rest.length > 0) {
    if (rest.length <= maxChars) {
      chunks.push(rest);
      break;
    }
    let cut = rest.lastIndexOf(" ", maxChars);
    if (cut < Math.floor(maxChars * 0.5)) cut = maxChars;
    chunks.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  return chunks.filter(Boolean);
}

/** When one paragraph exceeds maxChars: single newlines, then sentences, then word-aware slices. */
function splitOversizedParagraph(paragraph: string, maxChars: number): string[] {
  const t = paragraph.trim();
  if (t.length <= maxChars) return [t];

  const bySingleNl = t.split(/\n/).map((s) => s.trim()).filter(Boolean);
  if (bySingleNl.length > 1) {
    const out: string[] = [];
    for (const piece of bySingleNl) out.push(...splitOversizedParagraph(piece, maxChars));
    return out;
  }

  const sentences = t.split(/(?<=[.!?])\s+/).filter(Boolean);
  if (sentences.length > 1) {
    const merged: string[] = [];
    let cur = "";
    for (const s of sentences) {
      if (s.length > maxChars) {
        if (cur) {
          merged.push(cur.trim());
          cur = "";
        }
        merged.push(...hardSplitAtWordBoundary(s, maxChars));
        continue;
      }
      const next = cur ? `${cur} ${s}` : s;
      if (next.length <= maxChars) cur = next;
      else {
        if (cur) merged.push(cur.trim());
        cur = s;
      }
    }
    if (cur) merged.push(cur.trim());
    return merged.filter(Boolean);
  }

  return hardSplitAtWordBoundary(t, maxChars);
}

/** Prefer paragraph boundaries; merge short paragraphs into one request until near the limit. */
function mergeParagraphsIntoChunks(paragraphs: string[], maxChars: number): string[] {
  const chunks: string[] = [];
  let current = "";

  for (const para of paragraphs) {
    if (para.length > maxChars) {
      if (current) {
        chunks.push(current);
        current = "";
      }
      chunks.push(...splitOversizedParagraph(para, maxChars));
      continue;
    }

    const joiner = current ? "\n\n" : "";
    const candidate = current + joiner + para;
    if (candidate.length <= maxChars) {
      current = candidate;
    } else {
      if (current) chunks.push(current);
      current = para;
    }
  }
  if (current) chunks.push(current);
  return chunks.filter(Boolean);
}

function splitTextForTts(text: string): string[] {
  const t = normalizeNewlines(text).trim();
  if (!t) return [];
  if (t.length <= CHUNK_CHARS) return [t];

  const paragraphs = splitIntoParagraphs(t);
  const units = paragraphs.length > 0 ? paragraphs : [t];
  return mergeParagraphsIntoChunks(units, CHUNK_CHARS);
}

async function synthesizeChunk(
  text: string,
  voiceId: string,
  apiKey: string,
  modelId: string
): Promise<ArrayBuffer> {
  const res = await fetch(`${ELEVEN_BASE}/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      model_id: modelId,
      voice_settings: {
        stability: 0.32,          // DOWN from default ~0.75 — this is the big one
        similarity_boost: 0.78,
        style: 0.55,              // Adds prosody variation
        use_speaker_boost: true   // Sharpens presence
      },
    }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    throw new Error(`ElevenLabs ${res.status}: ${errText.slice(0, 500)}`);
  }
  return res.arrayBuffer();
}

/**
 * POST body: { script?: PodcastScript, fullText?: string, voiceId?, persist?, draftId?, grounding? }
 * Requires ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID (or body.voiceId).
 * When persist=true, draftId + script + PODCAST_AUDIO_STORAGE_BUCKET: insert podcast_episodes + upload MP3.
 */
export async function POST(req: Request) {
  const workspaceId = process.env.WORKSPACE_ID?.trim();
  const storageBucket = process.env.PODCAST_AUDIO_STORAGE_BUCKET?.trim();
  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  const defaultVoice = process.env.ELEVENLABS_VOICE_ID?.trim();
  const defaultModelId = process.env.ELEVENLABS_MODEL_ID?.trim() || "eleven_turbo_v2_5";

  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "ELEVENLABS_API_KEY is not configured" },
      { status: 503 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const draftIdForVoice = typeof body.draftId === "string" ? body.draftId.trim() : "";

  let voiceId = typeof body.voiceId === "string" ? body.voiceId.trim() : "";
  let modelId =
    typeof body.modelId === "string" && body.modelId.trim() ? body.modelId.trim() : defaultModelId;

  if (!voiceId && workspaceId && draftIdForVoice) {
    const supabase = supabaseAdmin();
    const fromBrand = await resolveElevenLabsFromDraftBrand(supabase, workspaceId, draftIdForVoice);
    if (fromBrand.voiceId) voiceId = fromBrand.voiceId;
    if (fromBrand.modelId && !body.modelId) modelId = fromBrand.modelId;
  }

  voiceId = voiceId || defaultVoice || "";
  if (!voiceId) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "No ElevenLabs voice: set body.voiceId, ELEVENLABS_VOICE_ID, or brand_profiles.elevenlabs_voice_id for this draft's brand profile",
      },
      { status: 400 }
    );
  }

  const scriptObj = body.script && typeof body.script === "object" ? (body.script as PodcastScript) : null;

  let fullText = "";
  if (typeof body.fullText === "string" && body.fullText.trim()) {
    fullText = body.fullText.trim();
  } else if (scriptObj) {
    fullText = fullNarrationText(scriptObj);
  }

  if (!fullText) {
    return NextResponse.json(
      { ok: false, error: "Provide script (PodcastScript) or fullText string" },
      { status: 400 }
    );
  }

  const wantPersist = body.persist === true;
  const draftId = typeof body.draftId === "string" ? body.draftId.trim() : "";
  if (wantPersist) {
    if (!workspaceId) {
      return NextResponse.json({ ok: false, error: "WORKSPACE_ID is not set" }, { status: 503 });
    }
    if (!draftId) {
      return NextResponse.json({ ok: false, error: "draftId is required when persist is true" }, { status: 400 });
    }
    if (!scriptObj) {
      return NextResponse.json(
        { ok: false, error: "script is required when persist is true (for podcast_episodes.script_json)" },
        { status: 400 }
      );
    }
    if (!storageBucket) {
      return NextResponse.json(
        { ok: false, error: "PODCAST_AUDIO_STORAGE_BUCKET is not set; cannot persist" },
        { status: 400 }
      );
    }
  }

  let grounding: { resolvedCount: number; unmatchedCount: number } | null = null;
  if (body.grounding && typeof body.grounding === "object") {
    const r = Number((body.grounding as { resolvedCount?: unknown }).resolvedCount);
    const u = Number((body.grounding as { unmatchedCount?: unknown }).unmatchedCount);
    grounding = {
      resolvedCount: Number.isFinite(r) ? r : 0,
      unmatchedCount: Number.isFinite(u) ? u : 0,
    };
  }

  try {
    const chunks = splitTextForTts(fullText);
    const buffers: Uint8Array[] = [];
    for (const chunk of chunks) {
      const ab = await synthesizeChunk(chunk, voiceId, apiKey, modelId);
      buffers.push(new Uint8Array(ab));
    }
    const total = buffers.reduce((n, b) => n + b.length, 0);
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const b of buffers) {
      merged.set(b, offset);
      offset += b.length;
    }

    const headers: Record<string, string> = {
      "Content-Type": "audio/mpeg",
      "Content-Disposition": `attachment; filename="podcast-${Date.now()}.mp3"`,
      "X-Podcast-Tts-Chunks": String(chunks.length),
    };

    if (wantPersist && storageBucket && workspaceId && draftId && scriptObj) {
      const supabase = supabaseAdmin();
      const saved = await persistPodcastEpisodeAfterTts(supabase, {
        workspaceId,
        draftId,
        script: scriptObj,
        grounding,
        audio: merged,
        storageBucket,
        voiceId,
        modelId,
      });
      if (saved.ok) {
        headers["X-Podcast-Persist-Status"] = "ok";
        headers["X-Podcast-Episode-Id"] = saved.episodeId;
        headers["X-Podcast-Storage-Path"] = saved.storagePath;
      } else {
        headers["X-Podcast-Persist-Status"] = "failed";
        headers["X-Podcast-Persist-Error"] = saved.error.slice(0, 500);
        if (saved.episodeId) headers["X-Podcast-Episode-Id"] = saved.episodeId;
      }
    }

    return new NextResponse(merged, {
      status: 200,
      headers,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
