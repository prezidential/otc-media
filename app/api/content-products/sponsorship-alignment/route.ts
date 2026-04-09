import { NextResponse } from "next/server";
import { claudeClient } from "@/lib/llm/claude";
import { supabaseAdmin } from "@/lib/supabase/server";
import { draftSummaryForContentProducts } from "@/lib/content-products/promptContext";
import { loadDraftContentJson } from "@/lib/content-products/loadDraft";

const MODEL = "claude-sonnet-4-20250514";
const MAX_TOKENS = 1024;

function safeJsonParse<T>(text: string): T | null {
  try {
    const t = text.trim().replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
    return JSON.parse(t) as T;
  } catch {
    return null;
  }
}

type AlignmentShape = {
  recommended_item_id?: string | null;
  confidence?: "high" | "medium" | "low";
  rationale?: string;
  suggested_mention?: string;
};

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
  const { data: items, error: itemsError } = await supabase
    .from("revenue_items")
    .select("id, type, title, description, priority_score, active")
    .eq("workspace_id", workspaceId)
    .eq("active", true)
    .order("priority_score", { ascending: false })
    .limit(10);

  if (itemsError) {
    return NextResponse.json({ error: itemsError.message }, { status: 500 });
  }
  if (!items?.length) {
    return NextResponse.json({ error: "No active revenue items to align" }, { status: 404 });
  }

  const catalog = items.map((i) => ({
    id: i.id,
    type: i.type,
    title: i.title,
    description: (i.description ?? "").slice(0, 400),
    priority_score: i.priority_score,
  }));

  const summary = draftSummaryForContentProducts(contentJson);
  const system = `You match newsletter issues to sponsorship / revenue offers. Output strict JSON only. No markdown fences.
You must only reference revenue item ids from the provided catalog. If nothing fits well, set recommended_item_id to null and confidence low.`;

  const user = `Draft summary:
---
${summary}
---

Active revenue items (choose best thematic fit for this issue):
${JSON.stringify(catalog, null, 2)}

Return JSON:
{
  "recommended_item_id": "<uuid from catalog or null>",
  "confidence": "high" | "medium" | "low",
  "rationale": "1-3 sentences, internal tone ok",
  "suggested_mention": "1-2 sentences a host could read; no fabricated stats; plain language"
}`;

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
    const parsed = safeJsonParse<AlignmentShape>(raw);
    if (!parsed || typeof parsed !== "object") {
      return NextResponse.json({ ok: false, error: "Failed to parse model output as JSON" }, { status: 502 });
    }

    const id = parsed.recommended_item_id;
    const idOk =
      id == null ||
      (typeof id === "string" && catalog.some((c) => c.id === id));

    const confidence =
      parsed.confidence === "high" || parsed.confidence === "medium" || parsed.confidence === "low"
        ? parsed.confidence
        : "low";

    return NextResponse.json({
      ok: true,
      alignment: {
        recommended_item_id: idOk ? id : null,
        confidence,
        rationale: typeof parsed.rationale === "string" ? parsed.rationale : "",
        suggested_mention: typeof parsed.suggested_mention === "string" ? parsed.suggested_mention : "",
        catalog_invalid_id: id != null && !idOk,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
