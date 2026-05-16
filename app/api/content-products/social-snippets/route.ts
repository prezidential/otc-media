import { NextResponse } from "next/server";
import { claudeClient } from "@/lib/llm/claude";
import {
  formatBrandProfileBlockForSocialPrompt,
  resolveBrandProfileIdForSocial,
  type BrandProfileForContentProductsRow,
} from "@/lib/content-products/brandProfileForContentProducts";
import { draftSummaryForContentProducts } from "@/lib/content-products/promptContext";
import { loadDraftContentJson } from "@/lib/content-products/loadDraft";
import { requireWorkspace } from "@/lib/auth/session";

const MODEL = "claude-sonnet-4-20250514";
const MAX_TOKENS = 2048;
/** Higher than drafting so repeat clicks on the same draft don’t collapse to identical copy. */
const TEMPERATURE = 0.92;

const LEAD_ROTATIONS = [
  "Lead with the thesis in one sharp line, then tighten.",
  "Lead with who gets burned or what breaks first (stakes), then tie to the thesis.",
  "Open with a direct practitioner question, then answer it from the draft.",
  "Lead with one concrete detail or pattern from Fresh signals, not a slogan.",
] as const;

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

  const ctx = await requireWorkspace();
  if (ctx instanceof Response) return ctx;
  const { supabase, workspaceId } = ctx;

  let contentJson: Record<string, unknown>;
  let draftBrandProfileId: string | null | undefined;
  if (contentJsonOverride && typeof contentJsonOverride === "object") {
    contentJson = contentJsonOverride;
    draftBrandProfileId = undefined;
  } else {
    const loaded = await loadDraftContentJson(supabase, draftId, workspaceId);
    if (!loaded.ok) {
      return NextResponse.json({ error: loaded.error }, { status: loaded.Status });
    }
    contentJson = loaded.contentJson;
    draftBrandProfileId = loaded.brand_profile_id;
  }

  const bodyBrandProfileId =
    typeof body.brandProfileId === "string" && body.brandProfileId.trim() ? body.brandProfileId.trim() : undefined;
  const resolvedProfileId = resolveBrandProfileIdForSocial({
    draftBrandProfileId,
    bodyBrandProfileId,
  });

  let brandBlock = "";
  let brandDisplayName = "Identity Jedi";
  if (resolvedProfileId) {
    const { data: profileRow, error: profileError } = await supabase
      .from("brand_profiles")
      .select(
        "id,name,voice_rules_json,formatting_rules_json,forbidden_patterns_json,cta_rules_json,emoji_policy_json,narrative_preferences_json"
      )
      .eq("id", resolvedProfileId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (!profileError && profileRow) {
      brandBlock = formatBrandProfileBlockForSocialPrompt(profileRow as BrandProfileForContentProductsRow);
      if (typeof profileRow.name === "string" && profileRow.name.trim()) {
        brandDisplayName = profileRow.name.trim();
      }
    }
  }

  const summary = draftSummaryForContentProducts(contentJson);
  const rotationHint = LEAD_ROTATIONS[Math.floor(Math.random() * LEAD_ROTATIONS.length)];

  const system = brandBlock
    ? `You are the social distribution desk for "${brandDisplayName}". Output strict JSON only. No markdown fences. No commentary.
The user message includes BRAND PROFILE JSON (voice, formatting, forbidden patterns, emoji policy, narrative preferences, CTA rules). Follow that contract the same way the newsletter draft does. Social copy must feel like the same author, not generic marketing.
Baseline guardrails: direct, practitioner-respecting; no em dashes; no "the real issue is" patterns.`
    : `You are Identity Jedi's social desk. Output strict JSON only. No markdown fences. No commentary.
Voice: direct, practitioner-respecting, no em dashes, no "the real issue is" patterns.`;

  const user = `${brandBlock ? `${brandBlock}\n\n` : ""}From this newsletter draft context, write three distinct social posts${
    brandBlock ? " in this brand's voice (per JSON above)" : " in Identity Jedi voice"
  }.

Constraints:
- x_post: one post, max 260 characters (leave room). No thread numbering.
- linkedin_teaser: 2-4 short lines, professional but sharp, hook + one consequence line.
- threads: one short paragraph suitable for Threads/Bluesky (under 500 chars).
- Mirror the draft's specificity and heat (thesis, hook) — do not flatten into bland promo language.
- This endpoint may be called many times on the same draft: each response must use **fresh** wording, angles, and rhythm. Do not reuse the same opening phrase, hashtag pattern, or parallel sentence structure you would default to. Alternate what you emphasize across runs.
- Rotation for this request (apply on at least one platform; your choice which): ${rotationHint}

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
      temperature: TEMPERATURE,
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
