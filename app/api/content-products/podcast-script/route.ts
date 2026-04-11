import { NextResponse } from "next/server";
import { claudeClient } from "@/lib/llm/claude";
import { draftSummaryForContentProducts } from "@/lib/content-products/promptContext";
import { loadDraftContentJson } from "@/lib/content-products/loadDraft";
import { formatSignalGroundingForPrompt, resolveSignalsForDraft } from "@/lib/content-products/resolveSignals";
import {
  buildPodcastStyleBlock,
  parsePodcastScriptRequestOptions,
} from "@/lib/content-products/podcastScriptOptions";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { PodcastScript, PodcastScriptSegment } from "@/lib/content-products/podcastScriptTypes";

const MODEL = "claude-sonnet-4-20250514";
const MAX_TOKENS = 8192;

function safeJsonParse<T>(text: string): T | null {
  try {
    const t = text.trim().replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
    return JSON.parse(t) as T;
  } catch {
    return null;
  }
}

type RawSegment = { id?: unknown; title?: unknown; narrator_text?: unknown };

function normalizeScript(parsed: {
  working_title?: unknown;
  estimated_runtime_minutes?: unknown;
  script_segments?: unknown;
  sources_acknowledged?: unknown;
  outro_cta?: unknown;
}): PodcastScript {
  const rawSegments: PodcastScriptSegment[] = Array.isArray(parsed.script_segments)
    ? parsed.script_segments
        .map((s: RawSegment, i: number) => {
          if (!s || typeof s !== "object") return null;
          const id = typeof s.id === "string" && s.id.trim() ? s.id.trim() : `seg_${i + 1}`;
          const narrator_text = typeof s.narrator_text === "string" ? s.narrator_text.trim() : "";
          if (!narrator_text) return null;
          const title = typeof s.title === "string" ? s.title.trim() : undefined;
          return { id, ...(title ? { title } : {}), narrator_text };
        })
        .filter((x): x is PodcastScriptSegment => x != null)
    : [];

  const intro = rawSegments.find((s) => s.id === "intro");
  const rest = rawSegments.filter((s) => s.id !== "intro");
  const segments = intro ? [intro, ...rest] : rawSegments;

  const ack = Array.isArray(parsed.sources_acknowledged)
    ? parsed.sources_acknowledged.filter((x): x is string => typeof x === "string")
    : undefined;

  return {
    working_title: typeof parsed.working_title === "string" ? parsed.working_title.trim() : "Untitled episode",
    ...(typeof parsed.estimated_runtime_minutes === "number" && parsed.estimated_runtime_minutes > 0
      ? { estimated_runtime_minutes: Math.round(parsed.estimated_runtime_minutes) }
      : {}),
    script_segments: segments,
    ...(ack && ack.length > 0 ? { sources_acknowledged: ack } : {}),
    outro_cta: typeof parsed.outro_cta === "string" ? parsed.outro_cta.trim() : "",
  };
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const draftId = body.draftId as string | undefined;
  const contentJsonOverride = body.content_json as Record<string, unknown> | undefined;

  const workspaceId = process.env.WORKSPACE_ID;
  if (!workspaceId) {
    return NextResponse.json({ error: "WORKSPACE_ID is not set" }, { status: 503 });
  }

  let contentJson: Record<string, unknown>;
  if (contentJsonOverride && typeof contentJsonOverride === "object") {
    contentJson = contentJsonOverride;
  } else {
    const loaded = await loadDraftContentJson(draftId, workspaceId);
    if (!loaded.ok) {
      return NextResponse.json({ error: loaded.error }, { status: loaded.Status });
    }
    contentJson = loaded.contentJson;
  }

  const supabase = supabaseAdmin();
  const { grounded, unmatchedUrls } = await resolveSignalsForDraft(supabase, workspaceId, contentJson);
  const groundingBlock = formatSignalGroundingForPrompt(grounded, unmatchedUrls);
  const draftSummary = draftSummaryForContentProducts(contentJson);
  const styleOpts = parsePodcastScriptRequestOptions(body as Record<string, unknown>);
  const styleBlock = buildPodcastStyleBlock(styleOpts);

  const system = `You are the head writer for a solo voice-first podcast for Identity / IAM practitioners.
Every line is read by text-to-speech: write ONLY words meant to be spoken aloud.

Goals:
- ENGAGING and CONVERSATIONAL — like a sharp host talking to one smart listener, not narrating a PDF or newsletter.
- Ear-friendly: mix short punchy sentences with occasional longer ones; use contractions where natural; "you" / "your team" when it fits.
- Verbal handrails sparingly: e.g. "Here's the thing", "So what changed?", "The part people sleep on is..." — never every sentence.
- Accurate: ground claims in the provided draft and signal grounding; never invent outlets, article titles, or facts.

Hard bans:
- No em dashes (use commas, periods, or "and").
- No markdown, bullets, or numbered lists inside narrator_text.
- No bracketed stage directions, sound effects, or music cues.
- No "In today's episode we will discuss three things" / syllabus tone.
- No lazy contrast patterns ("This isn't X, it's Y" spam).

Output strict JSON only. No markdown fences. No commentary.`;

  const user = `### Show style (creator settings — follow closely)
${styleBlock}

### Source material

Draft context:
---
${draftSummary}
---

${groundingBlock}

### Task
Write a solo host script for roughly 12–18 minutes when read aloud (tune via segment count and narrator_text length).

Return JSON exactly in this shape:
{
  "working_title": "string",
  "estimated_runtime_minutes": 14,
  "script_segments": [
    {
      "id": "intro",
      "title": "Intro — welcome and roadmap",
      "narrator_text": "string"
    }
  ],
  "sources_acknowledged": ["url or signal id you explicitly name in the script"],
  "outro_cta": "string — warm sign-off + subscribe / next-episode tease, still spoken not corporate"
}

Rules for script_segments:
1. FIRST segment MUST have id exactly "intro". Its narrator_text MUST: (a) open with a warm welcome to the listener by the show vibe; (b) say clearly what this episode is about in plain language; (c) say who it is for; (d) preview 2–3 ideas or beats coming up and why they matter — like a real podcast intro, not an abstract.
2. Total 6–12 segments including intro. Body segments advance the story or argument with personality, transitions, and occasional rhetorical questions — still one continuous voice.
3. Each narrator_text is spoken prose only. You may use a single \\n\\n inside a string between short paragraphs to give TTS breathing room.
4. Do not read the newsletter word-for-word; synthesize and rephrase for listening.
5. sources_acknowledged: only items you explicitly name or clearly attribute.

### JSON shape reminder
Escape newlines inside JSON strings properly. No trailing commentary outside the JSON object.`;

  try {
    const client = claudeClient();
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      temperature: 0.88,
      system,
      messages: [{ role: "user", content: user }],
    });
    const block = msg.content?.find((b) => b.type === "text");
    const raw =
      block && block.type === "text" ? (block as { type: "text"; text: string }).text.trim() : "";
    const parsed = safeJsonParse<Record<string, unknown>>(raw);
    if (!parsed || typeof parsed !== "object") {
      return NextResponse.json({ ok: false, error: "Failed to parse model output as JSON" }, { status: 502 });
    }

    const script = normalizeScript(parsed);
    if (script.script_segments.length === 0) {
      return NextResponse.json({ ok: false, error: "Model returned no script segments" }, { status: 502 });
    }

    return NextResponse.json({
      ok: true,
      script,
      grounding: {
        resolvedCount: grounded.length,
        unmatchedCount: unmatchedUrls.length,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
