import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { claudeClient } from "@/lib/llm/claude";

const MODEL = "claude-sonnet-4-20250514";
const MAX_TOKENS = 8192;

function extractSourcesFromContrarianTake(contrarian_take: string): string[] {
  const match = contrarian_take.match(/\n\nSources:\s*\n([\s\S]*?)(?=\n\n|$)/i) || contrarian_take.match(/Sources:\s*\n([\s\S]*?)(?=\n\n|$)/i);
  if (!match) return [];
  const block = match[1].trim();
  return block
    .split(/\n/)
    .map((line) => line.replace(/^[-*]\s*/, "").trim())
    .filter((line) => line.startsWith("http://") || line.startsWith("https://"));
}

type EditorialAngle = {
  title: string; // max 7 words, no colon
  hook_line: string; // max 12 words
  hook_paragraphs: string[]; // 2-3 short paragraphs, 1-2 sentences each
  deep_dive_thesis: string; // 1 sentence, declarative
  uncomfortable_truth: string; // 1 sentence
  reframe: string; // 1 sentence
  deep_dive_outline: string[]; // 5-7 bullets
  dojo_checklist: string[]; // exactly 5 bullets (plain text)
};

function safeJsonParse<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

async function generateEditorialAngle(params: {
  client: any;
  model: string;
  max_tokens: number;
  brandProfile: any;
  leadsWithSources: Array<{ angle: string; why_now: string; who_it_impacts: string; contrarian_take: string; sources: string[] }>;
}): Promise<EditorialAngle> {
  const { client, model, max_tokens, brandProfile, leadsWithSources } = params;

  const leadsMini = leadsWithSources.map((l) => ({
    angle: l.angle,
    why_now: l.why_now,
    who_it_impacts: l.who_it_impacts,
    take: l.contrarian_take,
  }));

  const system = `You are the Identity Jedi Editor.
Your job is to extract one sharp editorial angle from the leads.
Return JSON only. No markdown. No commentary.
Rules:
- Do not summarize articles one by one.
- Find the shared pattern and take a position.
- Title max 7 words. No colon. No hype.
- hook_line max 12 words.
- Use short sentences.
- No dashes in sentences (no '-', '—', '–').
- Avoid "This isn't", "isn't just", "The real problem isn't".
`;

  const user = `
BRAND PROFILE JSON:
${JSON.stringify({
    voice_rules_json: brandProfile.voice_rules_json,
    formatting_rules_json: brandProfile.formatting_rules_json,
    forbidden_patterns_json: brandProfile.forbidden_patterns_json,
    emoji_policy_json: brandProfile.emoji_policy_json,
    narrative_preferences_json: brandProfile.narrative_preferences_json,
  }, null, 2)}

APPROVED LEADS (summaries):
${JSON.stringify(leadsMini, null, 2)}

Return JSON with this exact shape:
{
  "title": "...",
  "hook_line": "...",
  "hook_paragraphs": ["...", "..."],
  "deep_dive_thesis": "...",
  "uncomfortable_truth": "...",
  "reframe": "...",
  "deep_dive_outline": ["...", "..."],
  "dojo_checklist": ["...", "...", "...", "...", "..."]
}

Notes:
- dojo_checklist must be exactly 5 items.
- deep_dive_outline should be 5-7 bullets.
`;

  const msg = await client.messages.create({
    model,
    max_tokens: Math.min(1200, max_tokens),
    temperature: 0.4,
    system,
    messages: [{ role: "user", content: user }],
  });

  const textBlock = msg.content?.find((b: any) => b.type === "text");
  const raw = textBlock?.text?.trim() ?? "";
  const parsed = safeJsonParse<EditorialAngle>(raw);

  if (!parsed?.title || !parsed?.deep_dive_thesis) {
    // Fail safe: provide minimal default angle if JSON parse fails
    return {
      title: "Identity at Machine Speed",
      hook_line: "AI is moving faster than identity can govern.",
      hook_paragraphs: [
        "We built identity for humans. The environment is no longer human.",
        "The gap is not tools. The gap is the model."
      ],
      deep_dive_thesis: "AI forces identity governance to evolve from human workflows to machine-speed control.",
      uncomfortable_truth: "Most identity programs are misclassified, not underfunded.",
      reframe: "This is a classification failure before it is a speed problem.",
      deep_dive_outline: [
        "Name the pattern across the signals",
        "Explain why human-centric identity breaks under autonomous behavior",
        "Define AI agents as a distinct identity class",
        "Show how attackers exploit the gap",
        "What to change first in architecture and operating model"
      ],
      dojo_checklist: [
        "Create an AI agent identity class and governance rules",
        "Instrument behavior, not just authentication events",
        "Treat config management as identity infrastructure",
        "Build machine-speed authorization paths with guardrails",
        "Add audit trails for autonomous decisions"
      ],
    };
  }

  return parsed;
}


export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const brandProfileId = body.brandProfileId as string | undefined;
  const leadLimit = typeof body.leadLimit === "number" ? body.leadLimit : 6;

  if (!brandProfileId) {
    return NextResponse.json({ error: "brandProfileId required" }, { status: 400 });
  }

  const workspaceId = process.env.WORKSPACE_ID!;
  const supabase = supabaseAdmin();

  const { data: brandProfile, error: profileError } = await supabase
    .from("brand_profiles")
    .select("id,name,voice_rules_json,formatting_rules_json,forbidden_patterns_json,cta_rules_json,emoji_policy_json,narrative_preferences_json")
    .eq("id", brandProfileId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 });
  if (!brandProfile) return NextResponse.json({ error: "Brand profile not found" }, { status: 404 });

  const { data: leads, error: leadsError } = await supabase
    .from("editorial_leads")
    .select("id,angle,why_now,who_it_impacts,contrarian_take,created_at")
    .eq("workspace_id", workspaceId)
    .eq("status", "approved")
    .order("created_at", { ascending: false })
    .limit(leadLimit);

  if (leadsError) return NextResponse.json({ error: leadsError.message }, { status: 500 });
  const approvedLeads = leads ?? [];

  const leadsWithSources = approvedLeads.map((lead) => {
    const sources = extractSourcesFromContrarianTake(lead.contrarian_take ?? "");
    const takeWithoutSources = (lead.contrarian_take ?? "").replace(/\n\nSources:\s*\n[\s\S]*/i, "").trim();
    return {
      angle: lead.angle,
      why_now: lead.why_now,
      who_it_impacts: lead.who_it_impacts,
      contrarian_take: takeWithoutSources,
      sources,
    };
  });

  let promoText = "";
  try {
    let origin = "";
    try {
      origin = new URL(req.url).origin;
    } catch {
      origin = "";
    }
    if (!origin && process.env.VERCEL_URL) origin = `https://${process.env.VERCEL_URL}`;
    if (!origin) origin = "http://localhost:3000";
    const res = await fetch(`${origin}/api/revenue/recommend`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brandProfileId }),
    });
    const data = await res.json();
    if (data?.ok && data.promoText) promoText = data.promoText;
  } catch {
    promoText = "Subscribe.";
  }
  if (!promoText.trim()) promoText = "Subscribe.";

  const leadsBlock = leadsWithSources
    .map(
      (l, i) =>
        `[Lead ${i + 1}]
Angle: ${l.angle}
Why now: ${l.why_now}
Who it impacts: ${l.who_it_impacts}
Take: ${l.contrarian_take}
Sources (use these URLs only, do not invent): ${l.sources.join(", ") || "(none)"}`
    )
    .join("\n\n");

    const client = claudeClient();

    const angle = await generateEditorialAngle({
      client,
      model: MODEL,
      max_tokens: MAX_TOKENS,
      brandProfile,
      leadsWithSources,
    });


    const userPrompt = `You are assembling a single newsletter issue draft in Identity Jedi (IDJ) voice.
    Use only the approved leads and their listed Sources URLs. Do not invent any sources or citations.

   

    EDITORIAL ANGLE (must drive the Deep Dive):
    Title: ${angle.title}
    Hook line: ${angle.hook_line}
    Hook paragraphs:
    ${angle.hook_paragraphs.map((p) => `- ${p}`).join("\n")}
    Deep dive thesis (must appear in first 2 paragraphs of Deep Dive): ${angle.deep_dive_thesis}
    Uncomfortable truth (must appear verbatim in Deep Dive): ${angle.uncomfortable_truth}
    Reframe (must appear verbatim in Deep Dive): ${angle.reframe}
    Deep dive outline:
    ${angle.deep_dive_outline.map((b) => `- ${b}`).join("\n")}
    From the Dojo checklist (use these ideas, rewrite as needed, exactly 5 bullets):
    ${angle.dojo_checklist.map((b) => `- ${b}`).join("\n")}
    
    Approved leads (use 3-6 for Fresh Signals):
    ${leadsBlock}
    
    Promo slot text (insert verbatim in the Promo Slot section):
    ---
    ${promoText}
    ---

 Before writing the newsletter:

1. Extract the shared pattern across the approved leads.
2. Express that pattern as a single clear thesis about identity.
3. The thesis must be declarative, not descriptive.
4. Use that thesis to craft the Opening Hook.

Opening Hook structure (must follow this template):

Line 1: A shift statement. Use one of these forms:
- "This week, something shifted."
- "Something just changed."
- "We just crossed a line."

Line 2–3: Two short contrast lines that begin with "Not". Example:
"Not in a hype-cycle way."
"Not in a vendor-demo way."

Line 4: One escalation line that names the stakes for identity. No article references.

Line 5 (required): One short invitation or directive line:
"Let’s talk about it."
or
"Here’s what matters."
or
"Pay attention."

Do not reuse any exact hook lines from earlier drafts.
Write fresh phrasing each time while keeping the structure.

Rules:
- 5 lines minimum. 7 lines maximum.
- Each line is one sentence.
- Do not summarize the news.
- Do not mention specific vendors or articles.
- No dashes inside sentences.
- Avoid "This isn't", "isn't just", "The real problem isn't".
    
    Produce a complete issue draft as plain text with these sections in order. Use clear section labels.
    
    1) Title
- Max 6 words.
- No punctuation.
- Must reflect the thesis.
- No corporate phrasing.
    2) Opening Hook (use the hook_line as the first line, then 2-3 short paragraphs)
    3) Fresh Signals (3-6 items from the leads above). For each item: title/angle, 2-3 sentence take, then Sources in this exact format:
       Sources:
       - url
       - url
       Use only the URLs from that lead's list. Do not invent URLs.
4) Deep Dive (600–900 words, editorial, IDJ voice)

Structure:

Paragraph 1–2:
- Expand the thesis immediately.
- Do not recap articles.
- Establish authority and posture.

Middle section:
- Identify the core classification mistake identity teams are making.
- Explain the consequence of that mistake.
- Reference at most TWO specific signals from Fresh Signals.
- Everything else must be framed as pattern, not reporting.

Include:
- Exactly 3 bold declarative statements spaced throughout.
- One uncomfortable truth about identity programs.
- One reframing sentence that changes how the reader should think about the problem.

Tone rules:
- No advisory consulting tone.
- No “organizations should consider…”
- No recap language like “This article shows…”
- Keep paragraphs 1–2 sentences max.
- Maintain escalation.
- End with strategic clarity, not summary.
    5) From the Dojo (exactly 5 bullets, practical, no fluff)
    6) Promo Slot (the promo text above, verbatim, no changes)
    7) Close (short sign-off + CTA: Subscribe)
    
    Voice: No dashes inside sentences (no hyphen, em dash, or en dash). Avoid "This isn't", "isn't just", "The real problem isn't". Vary sentence starters. Keep paragraphs to 1-2 sentences.
    
    Output only the draft text. No meta commentary.`;

    const systemPrompt = `You write in Identity Jedi (IDJ) voice.
  Opening Hook must:
- Feel like a moment.
- Build tension or escalation.
- Not sound journalistic.
- Not summarize news.
- Use rhythm with short standalone lines.

Deep Dive must:
- Lead with thesis energy.
- Maintain authority and posture.
- Avoid soft advisory tone.


    Hook must not sound journalistic.
Hook must not reference specific articles.
Hook must read like short decisive statements.
Avoid explanatory tone in the first section.

    Opening Hook:
- Do not summarize the news.
- Do not start with article references.
- Do not explain.
- Declare.
    
    BRAND PROFILE JSON:
    ${JSON.stringify({
      voice_rules_json: brandProfile.voice_rules_json,
      formatting_rules_json: brandProfile.formatting_rules_json,
      forbidden_patterns_json: brandProfile.forbidden_patterns_json,
      emoji_policy_json: brandProfile.emoji_policy_json,
      narrative_preferences_json: brandProfile.narrative_preferences_json,
    }, null, 2)}
    
    Rules:
    - No dashes inside sentences (no '-', '—', '–').
    - Avoid "This isn't", "isn't just", "The real problem isn't".
    - Vary sentence starters.
    - Keep paragraphs 1-2 sentences.
    Fresh Signals: Sources formatted as:
    Sources:
    - url
    - url
    Do not invent sources.
    Promo Slot must be inserted verbatim.`;


  let draftText = "";
  try {
    const client = claudeClient();
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });
    const textBlock = msg.content?.find((b) => b.type === "text");
    draftText =
      textBlock && textBlock.type === "text"
        ? (textBlock as { type: "text"; text: string }).text.trim()
        : "";
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }

  let stored = false;
  try {
    const { error: insertError } = await supabase.from("issue_drafts").insert({
      workspace_id: workspaceId,
      brand_profile_id: brandProfileId,
      content: draftText,
    });
    if (!insertError) stored = true;
  } catch {
    // table may not exist; skip persistence
  }

  return NextResponse.json({
    ok: true,
    draft: draftText,
    stored,
  });
}
