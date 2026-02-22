import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { claudeClient } from "@/lib/llm/claude";

const MODEL = "claude-sonnet-4-20250514";
const MAX_TOKENS = 512;

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const brandProfileId = body.brandProfileId as string | undefined;

  if (!brandProfileId) {
    return NextResponse.json({ error: "brandProfileId required" }, { status: 400 });
  }

  const workspaceId = process.env.WORKSPACE_ID!;
  const supabase = supabaseAdmin();

  const { data: brandProfile, error: profileError } = await supabase
    .from("brand_profiles")
    .select("id,name,forbidden_patterns_json,emoji_policy_json,formatting_rules_json,cta_rules_json")
    .eq("id", brandProfileId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 });
  if (!brandProfile) return NextResponse.json({ error: "Brand profile not found" }, { status: 404 });

  const { data: items, error: itemsError } = await supabase
    .from("revenue_items")
    .select("id,type,title,description,priority_score,link,active,start_date,end_date")
    .eq("workspace_id", workspaceId)
    .eq("active", true)
    .order("priority_score", { ascending: false })
    .limit(1);

  if (itemsError) return NextResponse.json({ error: itemsError.message }, { status: 500 });
  const item = items?.[0];
  if (!item) return NextResponse.json({ error: "No active revenue item found" }, { status: 404 });

  const forbidden = Array.isArray(brandProfile.forbidden_patterns_json)
    ? brandProfile.forbidden_patterns_json
    : [];
  const forbiddenList = forbidden.length ? `Do not use these phrases or patterns: ${forbidden.join(", ")}.` : "";

  const truthfulnessRule =
    "Truthfulness: do not claim proprietary incident details, specific company tiers, or exact rules, playbooks, or configurations. Describe benefits in general terms only.";
  const practitionerBans =
    "Do not use: exclusive, free newsletter, readers miss, analysis, insights, complex, today.";
  const voiceForbidden =
    "Practitioner recommendation mode: recommend in plain language to practitioners. Never use the pattern 'This isn't X' or 'This is not X' or 'It's not X, it's Y'. Do not use these buzzwords or phrases: " +
    (forbidden.length ? forbidden.join(", ") : "synergy, drive value, empower, Here's the thing, The truth is, Now more than ever, At the end of the day.") +
    " " +
    practitionerBans;

  const emojiRules =
    brandProfile.emoji_policy_json && typeof brandProfile.emoji_policy_json === "object"
      ? `Emoji policy: ${JSON.stringify(brandProfile.emoji_policy_json)}.`
      : "";

  const formattingRules =
    brandProfile.formatting_rules_json && typeof brandProfile.formatting_rules_json === "object"
      ? `Formatting rules: ${JSON.stringify(brandProfile.formatting_rules_json)}.`
      : "";

  const ctaRules =
    brandProfile.cta_rules_json && typeof brandProfile.cta_rules_json === "object"
      ? `CTA rules (use for the final line): ${JSON.stringify(brandProfile.cta_rules_json)}.`
      : "Include one clear CTA line at the end.";

  const userPrompt = `Write a short promo block for this product in practitioner recommendation mode. Output only the promo text, nothing else. No JSON, no labels, no explanation.

Product: ${item.title}
Type: ${item.type}

Requirements:
- Exactly 3 to 5 lines total. One sentence per line.
- First line: state one concrete outcome in plain language (what the practitioner gets or can do).
- Last line: must be exactly "Subscribe." Nothing else on that line.
- Do not use dashes within sentences (no em dashes or hyphens mid sentence).
- Truthfulness: do not claim proprietary incident details, specific company tiers, or exact rules, playbooks, or configurations; describe benefits in general terms only.
${forbiddenList ? `- ${forbiddenList}` : ""}
${emojiRules ? `- ${emojiRules}` : ""}
${formattingRules ? `- ${formattingRules}` : ""}
- ${ctaRules}`;

  const systemPrompt = `You respond with only the requested promo copy. Practitioner recommendation mode: plain language for practitioners. Plain text only. No code blocks, no quotes, no preamble.
${truthfulnessRule}
Strict voice rules: ${voiceForbidden}
Output format: exactly 3 to 5 lines, one sentence per line. Line 1 = one concrete outcome in plain language. Final line = exactly "Subscribe."`;

  try {
    const client = claudeClient();
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    const textBlock = msg.content?.find((b) => b.type === "text");
    const promoText =
      textBlock && textBlock.type === "text"
        ? (textBlock as { type: "text"; text: string }).text.trim()
        : "";

    return NextResponse.json({
      ok: true,
      item: {
        id: item.id,
        type: item.type,
        title: item.title,
        description: item.description,
        priority_score: item.priority_score,
        link: item.link,
        active: item.active,
        start_date: item.start_date,
        end_date: item.end_date,
      },
      promoText: promoText || "(No content generated)",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
