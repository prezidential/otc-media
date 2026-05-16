import { NextResponse } from "next/server";
import { claudeClient } from "@/lib/llm/claude";
import { requireWorkspace } from "@/lib/auth/session";
import { draftSummaryForContentProducts } from "@/lib/content-products/promptContext";
import { loadDraftContentJson } from "@/lib/content-products/loadDraft";

const MODEL = "claude-sonnet-4-20250514";
const MAX_TOKENS = 4096;

function safeJsonParse<T>(text: string): T | null {
  try {
    const t = text.trim().replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
    return JSON.parse(t) as T;
  } catch {
    return null;
  }
}

type Segment = { title: string; beats: string[] };
type OutlineShape = {
  working_title?: string;
  hook?: string;
  segments?: Segment[];
  outro_cta?: string;
};

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const draftId = body.draftId as string | undefined;
  const contentJsonOverride = body.content_json as Record<string, unknown> | undefined;

  const ctx = await requireWorkspace();
  if (ctx instanceof Response) return ctx;
  const { supabase, workspaceId } = ctx;

  let contentJson: Record<string, unknown>;
  if (contentJsonOverride && typeof contentJsonOverride === "object") {
    contentJson = contentJsonOverride;
  } else {
    const loaded = await loadDraftContentJson(supabase, draftId, workspaceId);
    if (!loaded.ok) {
      return NextResponse.json({ error: loaded.error }, { status: loaded.Status });
    }
    contentJson = loaded.contentJson;
  }

  const summary = draftSummaryForContentProducts(contentJson);
  const system = `You are a podcast producer for an Identity / IAM practitioner audience. Output strict JSON only. No markdown fences. No commentary.
Tone: sharp but accurate; no em dashes; no lazy contrast structures.`;

  const user = `Turn this newsletter issue into a 12-18 minute solo outline (talking points, not a script).

Draft context:
---
${summary}
---

Return JSON exactly in this shape:
{
  "working_title": "string",
  "hook": "30-45 second cold open idea",
  "segments": [
    { "title": "segment label", "beats": ["beat 1", "beat 2"] }
  ],
  "outro_cta": "subscribe / next episode tease"
}
Use 4-6 segments. Each segment 2-4 beats. Beats are short phrases the host can riff from.`;

  try {
    const client = claudeClient();
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system,
      messages: [{ role: "user", content: user }],
    });
    const block = msg.content?.find((b) => b.type === "text");
    const raw =
      block && block.type === "text" ? (block as { type: "text"; text: string }).text.trim() : "";
    const parsed = safeJsonParse<OutlineShape>(raw);
    if (!parsed || typeof parsed !== "object") {
      return NextResponse.json({ ok: false, error: "Failed to parse model output as JSON" }, { status: 502 });
    }

    const segments: Segment[] = Array.isArray(parsed.segments)
      ? parsed.segments
          .filter(
            (s): s is Segment =>
              s != null && typeof s === "object" && typeof (s as Segment).title === "string"
          )
          .map((s) => ({
            title: s.title,
            beats: Array.isArray(s.beats)
              ? s.beats.filter((b): b is string => typeof b === "string")
              : [],
          }))
      : [];

    return NextResponse.json(
      {
        ok: true,
        outline: {
          working_title: typeof parsed.working_title === "string" ? parsed.working_title : "",
          hook: typeof parsed.hook === "string" ? parsed.hook : "",
          segments,
          outro_cta: typeof parsed.outro_cta === "string" ? parsed.outro_cta : "",
        },
      },
      {
        headers: {
          Deprecation: 'true',
          Link: '</api/content-products/podcast-script>; rel="successor-version"',
        },
      }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
