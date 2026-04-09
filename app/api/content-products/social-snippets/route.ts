import { NextResponse } from "next/server";
import { claudeClient } from "@/lib/llm/claude";
import { draftSummaryForContentProducts } from "@/lib/content-products/promptContext";
import { loadDraftContentJson } from "@/lib/content-products/loadDraft";

const MODEL = "claude-sonnet-4-20250514";
const MAX_TOKENS = 2048;

function safeJsonParse<T>(text: string): T | null {
  try {
    const t = text.trim().replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
    return JSON.parse(t) as T;
  } catch {
    return null;
  }
}

type SnippetsShape = { x_post?: string; linkedin_teaser?: string; threads?: string };

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

  const summary = draftSummaryForContentProducts(contentJson);
  const system = `You are Identity Jedi's social desk. Output strict JSON only. No markdown fences. No commentary.
Voice: direct, practitioner-respecting, no em dashes, no "the real issue is" patterns.`;

  const user = `From this newsletter draft context, write three distinct social posts in Identity Jedi voice.

Constraints:
- x_post: one post, max 260 characters (leave room). No thread numbering.
- linkedin_teaser: 2-4 short lines, professional but sharp, hook + one consequence line.
- threads: one short paragraph suitable for Threads/Bluesky (under 500 chars).

Draft context:
---
${summary}
---

Return JSON exactly in this shape:
{"x_post":"...","linkedin_teaser":"...","threads":"..."}`;

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
    const parsed = safeJsonParse<SnippetsShape>(raw);
    if (!parsed || typeof parsed !== "object") {
      return NextResponse.json({ ok: false, error: "Failed to parse model output as JSON" }, { status: 502 });
    }

    return NextResponse.json({
      ok: true,
      snippets: {
        x_post: typeof parsed.x_post === "string" ? parsed.x_post : "",
        linkedin_teaser: typeof parsed.linkedin_teaser === "string" ? parsed.linkedin_teaser : "",
        threads: typeof parsed.threads === "string" ? parsed.threads : "",
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
