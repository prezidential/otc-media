import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { claudeClient } from "@/lib/llm/claude";
import { createDraftContent, DEFAULT_CLOSE, renderDraftMarkdown, validateDraftObject, type DraftObject, type DraftContentJson } from "@/lib/draft/content";
import {
  applyDashReplaceMap,
  lintDraft,
  rewriteLintViolations,
  type LintViolation,
} from "@/lib/draft/lint";

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

type CurationResult = {
  selectedIndices: number[];
  rationale: string;
};

async function curateLeads(
  allLeads: Array<{ index: number; angle: string; why_now: string; who_it_impacts: string; contrarian_take: string }>,
  steering: { aggressionLevel: number; audienceLevel: string; focusArea: string; toneMode: string },
  maxLeads: number
): Promise<CurationResult> {
  const client = claudeClient();

  const leadsText = allLeads
    .map(
      (l) => `[Lead ${l.index + 1}]
Angle: ${l.angle}
Why now: ${l.why_now}
Who it impacts: ${l.who_it_impacts}
Take: ${l.contrarian_take}`
    )
    .join("\n\n");

  const prompt = `You are the Identity Jedi editorial desk editor. You have ${allLeads.length} approved leads below. Your job is to select the ${Math.min(maxLeads, allLeads.length)} best leads that together form a cohesive, compelling newsletter issue.

Selection criteria:
- Angle diversity: avoid leads that cover the same story from the same angle
- Narrative tension: pick leads that build toward a shared thesis
- Timeliness: prefer leads with stronger "why now" urgency
- Audience fit: audience is "${steering.audienceLevel}", focus is "${steering.focusArea}", tone is "${steering.toneMode}", aggression ${steering.aggressionLevel}/5
- Coverage breadth: balance vendor, threat, governance, and architecture angles when available

Approved leads:
${leadsText}

Return strict JSON only. No markdown. No commentary.
{
  "selected": [1, 3, 5],
  "rationale": "One sentence explaining the editorial thread connecting these leads."
}

"selected" must be an array of lead numbers (1-indexed) from the list above. Select between 3 and ${maxLeads} leads.`;

  try {
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 512,
      system: "You are a senior editorial desk editor. Output strict JSON only.",
      messages: [{ role: "user", content: prompt }],
    });
    const textBlock = msg.content?.find((b) => b.type === "text");
    const raw = (textBlock && textBlock.type === "text" ? (textBlock as { type: "text"; text: string }).text : "").trim();
    const stripped = raw.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
    const parsed = safeJsonParse<{ selected: number[]; rationale: string }>(stripped);

    if (parsed?.selected && Array.isArray(parsed.selected) && parsed.selected.length > 0) {
      const validIndices = parsed.selected
        .filter((n) => typeof n === "number" && n >= 1 && n <= allLeads.length)
        .map((n) => n - 1);
      if (validIndices.length > 0) {
        return {
          selectedIndices: validIndices,
          rationale: typeof parsed.rationale === "string" ? parsed.rationale : "Editor-curated selection.",
        };
      }
    }
  } catch {
    // fall through to default
  }

  const fallbackIndices = allLeads.slice(0, maxLeads).map((l) => l.index);
  return { selectedIndices: fallbackIndices, rationale: "Default selection (most recent leads)." };
}

const FALLBACK_THESIS = "Identity programs are misclassified, not underfunded.";

const FORBIDDEN_THESIS_PATTERNS = [
  "the real issue is",
  "the real risk is",
  "the real problem is",
];

type ThesisCandidate = {
  id: string;
  thesis: string;
  scores: { distinctiveness: number; tension: number; operator_usefulness: number; mode_fit: number };
  total: number;
};
type ThesisEngineResponse = { theses: ThesisCandidate[]; selected_id: string };

type ThesisResult = {
  selectedThesis: string;
  theses: ThesisCandidate[];
  selectedBy?: "editor" | "model";
  thesisError?: boolean;
  thesisErrorReason?: string;
};

function thesisOneSentenceHeuristic(s: string): boolean {
  if (s.includes("\n")) return false;
  const terminators = (s.match(/[.!?]/g) || []).length;
  return terminators <= 1;
}

function thesisHasUrl(s: string): boolean {
  return s.includes("http://") || s.includes("https://");
}

function thesisHasForbidden(s: string): boolean {
  const lower = s.toLowerCase();
  return FORBIDDEN_THESIS_PATTERNS.some((p) => lower.includes(p));
}

function computeTotal(t: ThesisCandidate): number {
  if (typeof t.total === "number" && !Number.isNaN(t.total)) return t.total;
  const s = t.scores;
  if (!s || typeof s !== "object") return 0;
  const d = typeof s.distinctiveness === "number" ? s.distinctiveness : 0;
  const ten = typeof s.tension === "number" ? s.tension : 0;
  const o = typeof s.operator_usefulness === "number" ? s.operator_usefulness : 0;
  const m = typeof s.mode_fit === "number" ? s.mode_fit : 0;
  return d + ten + o + m;
}

function computeWeightedTotal(t: ThesisCandidate, outputMode: string): number {
  const s = t.scores;
  if (!s || typeof s !== "object") return 0;
  const d = typeof s.distinctiveness === "number" ? s.distinctiveness : 0;
  const ten = typeof s.tension === "number" ? s.tension : 0;
  const o = typeof s.operator_usefulness === "number" ? s.operator_usefulness : 0;
  const m = typeof s.mode_fit === "number" ? s.mode_fit : 0;
  if (outputMode === "full_issue") {
    return o * 2 + m * 1.5 + ten + d;
  }
  if (outputMode === "insider_access") {
    return ten * 2 + o + d + m;
  }
  return d + ten + o + m;
}

async function runThesisEngine(leadsBlock: string, outputMode: string): Promise<ThesisResult> {
  const systemThesis = `You are the Identity Jedi editorial strategy desk. Output strict JSON only. No markdown. No commentary.`;

  const userThesis = `Generate three distinct one sentence editorial theses based on the approved leads.

Constraints:
- Each thesis must be exactly one sentence.
- Each thesis must take a strong position someone could disagree with.
- Do not summarize the leads or list events.
- Do not include URLs.
- Avoid generic phrases: "this week", "signals", "the industry", "in todays world", "the real issue is", "the real risk is", "the real problem is".
- No dashes inside sentences.

Scoring rubric:
- distinctiveness: 1 to 5
- tension: 1 to 5
- operator_usefulness: 1 to 5
- mode_fit: 1 to 5, mode is "${outputMode}"

Return strict JSON in this shape:
{
  "theses": [
    { "id": "t1", "thesis": "...", "scores": { "distinctiveness": 1, "tension": 1, "operator_usefulness": 1, "mode_fit": 1 }, "total": 4 },
    { "id": "t2", "thesis": "...", "scores": { "distinctiveness": 1, "tension": 1, "operator_usefulness": 1, "mode_fit": 1 }, "total": 4 },
    { "id": "t3", "thesis": "...", "scores": { "distinctiveness": 1, "tension": 1, "operator_usefulness": 1, "mode_fit": 1 }, "total": 4 }
  ],
  "selected_id": "t2"
}

Approved leads:
${leadsBlock}`;

  try {
    const client = claudeClient();
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: systemThesis,
      messages: [{ role: "user", content: userThesis }],
    });
    const textBlock = msg.content?.find((b) => b.type === "text");
    const raw = (textBlock && textBlock.type === "text" ? (textBlock as { type: "text"; text: string }).text : "").trim();
    const stripped = raw.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
    const parsed = safeJsonParse<ThesisEngineResponse>(stripped);

    if (!parsed?.theses || !Array.isArray(parsed.theses) || parsed.theses.length !== 3) {
      return {
        selectedThesis: FALLBACK_THESIS,
        theses: [],
        selectedBy: "editor",
        thesisError: true,
        thesisErrorReason: "Expected exactly 3 theses",
      };
    }

    const theses = parsed.theses;
    for (let i = 0; i < theses.length; i++) {
      const t = theses[i];
      const thesisText = typeof t?.thesis === "string" ? t.thesis.trim() : "";
      if (!thesisText) {
        return {
          selectedThesis: FALLBACK_THESIS,
          theses: [],
          selectedBy: "editor",
          thesisError: true,
          thesisErrorReason: `Thesis ${i + 1} missing or empty`,
        };
      }
      if (!thesisOneSentenceHeuristic(thesisText)) {
        return {
          selectedThesis: FALLBACK_THESIS,
          theses: [],
          selectedBy: "editor",
          thesisError: true,
          thesisErrorReason: `Thesis ${i + 1} must be exactly one sentence`,
        };
      }
      if (thesisHasUrl(thesisText)) {
        return {
          selectedThesis: FALLBACK_THESIS,
          theses: [],
          selectedBy: "editor",
          thesisError: true,
          thesisErrorReason: `Thesis ${i + 1} must not contain URLs`,
        };
      }
      if (thesisHasForbidden(thesisText)) {
        return {
          selectedThesis: FALLBACK_THESIS,
          theses: [],
          selectedBy: "editor",
          thesisError: true,
          thesisErrorReason: `Thesis ${i + 1} contains forbidden pattern`,
        };
      }
    }

    const withTotals = theses.map((t) => ({
      ...t,
      total: computeTotal(t),
      weightedTotal: computeWeightedTotal(t, outputMode),
    }));

    function cmpEditor(a: (typeof withTotals)[0], b: (typeof withTotals)[0]): number {
      const diff = b.weightedTotal - a.weightedTotal;
      if (diff > 0.5) return 1;
      if (diff < -0.5) return -1;
      const o = (b.scores?.operator_usefulness ?? 0) - (a.scores?.operator_usefulness ?? 0);
      if (o !== 0) return o;
      const m = (b.scores?.mode_fit ?? 0) - (a.scores?.mode_fit ?? 0);
      if (m !== 0) return m;
      return (b.scores?.distinctiveness ?? 0) - (a.scores?.distinctiveness ?? 0);
    }

    let selected: (typeof withTotals)[0];
    let selectedBy: "editor" | "model";

    if (outputMode === "full_issue") {
      selected = [...withTotals].sort(cmpEditor)[0] ?? withTotals[0];
      selectedBy = "editor";
    } else {
      const byId = withTotals.find((t) => t.id === parsed.selected_id);
      if (byId) {
        selected = byId;
        selectedBy = "model";
      } else {
        selected = [...withTotals].sort(cmpEditor)[0] ?? withTotals[0];
        selectedBy = "editor";
      }
    }

    return { selectedThesis: selected.thesis.trim(), theses: withTotals, selectedBy };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return {
      selectedThesis: FALLBACK_THESIS,
      theses: [],
      selectedBy: "editor",
      thesisError: true,
      thesisErrorReason: reason,
    };
  }
}

async function generateEditorialAngle(params: {
  client: any;
  model: string;
  max_tokens: number;
  brandProfile: any;
  leadsWithSources: Array<{ angle: string; why_now: string; who_it_impacts: string; contrarian_take: string; sources: string[] }>;
  previousTitles?: string[];
}): Promise<EditorialAngle> {
  const { client, model, max_tokens, brandProfile, leadsWithSources, previousTitles } = params;

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
- The title MUST be unique and specific to these leads. Do not use generic titles.${previousTitles && previousTitles.length > 0 ? `\n- Do NOT reuse any of these previous titles: ${previousTitles.map((t) => `"${t}"`).join(", ")}` : ""}
`;

  const msg = await client.messages.create({
    model,
    max_tokens: 2048,
    temperature: 0.6,
    system,
    messages: [{ role: "user", content: user }],
  });

  const textBlock = msg.content?.find((b: any) => b.type === "text");
  const raw = textBlock?.text?.trim() ?? "";
  const stripped = raw.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  const parsed = safeJsonParse<EditorialAngle>(stripped);

  if (!parsed?.title || !parsed?.deep_dive_thesis) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[editorial-angle] JSON parse failed. Raw length:", raw.length, "First 300 chars:", raw.slice(0, 300));
    }
    throw new Error("Editorial angle generation failed to produce valid JSON");
  }

  return parsed;
}


const AUDIENCE_LEVELS = ["practitioner", "ciso", "board"] as const;
const FOCUS_AREAS = ["strategic", "tactical", "architecture"] as const;
const TONE_MODES = ["reflective", "confrontational", "analytical", "strategic"] as const;

type AudienceLevel = (typeof AUDIENCE_LEVELS)[number];
type FocusArea = (typeof FOCUS_AREAS)[number];
type ToneMode = (typeof TONE_MODES)[number];

function parseSteering(body: Record<string, unknown>) {
  const aggressionLevel = Math.min(5, Math.max(1, Number(body.aggressionLevel) || 3));
  const audienceLevel = AUDIENCE_LEVELS.includes(body.audienceLevel as AudienceLevel) ? (body.audienceLevel as AudienceLevel) : "practitioner";
  const focusArea = FOCUS_AREAS.includes(body.focusArea as FocusArea) ? (body.focusArea as FocusArea) : "architecture";
  const toneMode = TONE_MODES.includes(body.toneMode as ToneMode) ? (body.toneMode as ToneMode) : "strategic";
  return { aggressionLevel, audienceLevel, focusArea, toneMode };
}

const OUTPUT_MODES = ["full_issue", "insider_access", "bundle"] as const;
type OutputMode = (typeof OUTPUT_MODES)[number];

function parseOutputMode(body: Record<string, unknown>): OutputMode {
  return OUTPUT_MODES.includes(body.outputMode as OutputMode) ? (body.outputMode as OutputMode) : "full_issue";
}

async function generateInsiderDraft(
  leadsBlock: string,
  steering: { aggressionLevel: number; audienceLevel: string; focusArea: string; toneMode: string },
  primaryThesis: string
): Promise<string> {
  const insiderUserPrompt = `You are writing an Insider Access artifact for experienced IAM practitioners. Use only the approved leads and their listed Sources URLs. Do not invent any sources or citations.

Primary Thesis:
${primaryThesis}

Every section must reinforce this thesis. Avoid recap.

Editorial Steering Inputs:
- aggressionLevel: ${steering.aggressionLevel} (1-5)
- audienceLevel: ${steering.audienceLevel}
- focusArea: ${steering.focusArea}
- toneMode: ${steering.toneMode}

Approved leads:
${leadsBlock}

Produce ONLY the Insider Access artifact as plain text with these sections in order. Use clear section labels.

1) Title (max 8 words, no punctuation)
2) What Most Teams Miss (2-4 paragraphs)
3) What I Would Actually Change (2-4 paragraphs)
4) Vendor Reality Check (direct, opinionated, no brand bashing)
5) Tactical Architecture Shift (3-5 bullets)

Rules:
- No hook. No invitation lines. No promo. No recap tone.
- Assume audience is experienced IAM practitioner. Go deeper than public editorial.
- Reference at most 2 signals by name. Use only URLs from the Sources lists above; do not invent sources.
- No dashes inside sentences (no hyphen, em dash, or en dash).
- Maintain Identity Jedi posture but more surgical and less rhetorical.
- Keep paragraphs to 1-2 sentences.

Output only the artifact text. No meta commentary.`;

  const insiderSystemPrompt = `You write in Identity Jedi voice: surgical, direct, no fluff. Insider Access is for experienced IAM practitioners. Do not invent sources; cite only URLs provided for each lead. No dashes inside sentences.`;

  const client = claudeClient();
  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: insiderSystemPrompt,
    messages: [{ role: "user", content: insiderUserPrompt }],
  });
  const textBlock = msg.content?.find((b) => b.type === "text");
  return textBlock && textBlock.type === "text"
    ? (textBlock as { type: "text"; text: string }).text.trim()
    : "";
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const brandProfileId = body.brandProfileId as string | undefined;
  const steering = parseSteering(body);
  const outputMode = parseOutputMode(body);

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

  const maxLeads = typeof body.leadLimit === "number" && body.leadLimit >= 1 ? body.leadLimit : 8;

  const { data: allApproved, error: leadsError } = await supabase
    .from("editorial_leads")
    .select("id,angle,why_now,who_it_impacts,contrarian_take,created_at")
    .eq("workspace_id", workspaceId)
    .eq("status", "approved")
    .order("created_at", { ascending: false })
    .limit(20);

  if (leadsError) return NextResponse.json({ error: leadsError.message }, { status: 500 });

  if (!allApproved || allApproved.length === 0) {
    return NextResponse.json(
      { ok: false, error: "No approved leads available. Approve some leads first." },
      { status: 400 }
    );
  }

  const allLeadsWithSources = allApproved.map((lead, idx) => {
    const sources = extractSourcesFromContrarianTake(lead.contrarian_take ?? "");
    const takeWithoutSources = (lead.contrarian_take ?? "").replace(/\n\nSources:\s*\n[\s\S]*/i, "").trim();
    return {
      index: idx,
      id: lead.id,
      angle: lead.angle,
      why_now: lead.why_now,
      who_it_impacts: lead.who_it_impacts,
      contrarian_take: takeWithoutSources,
      sources,
    };
  });

  const curation = await curateLeads(allLeadsWithSources, steering, maxLeads);
  const curatedLeads = curation.selectedIndices.map((i) => allLeadsWithSources[i]).filter(Boolean);
  const approvedLeads = curatedLeads.map((l) => ({ id: l.id, angle: l.angle, why_now: l.why_now, who_it_impacts: l.who_it_impacts, contrarian_take: l.contrarian_take, sources: l.sources }));

  const leadsWithSources = curatedLeads.map((l) => ({
    angle: l.angle,
    why_now: l.why_now,
    who_it_impacts: l.who_it_impacts,
    contrarian_take: l.contrarian_take,
    sources: l.sources,
  }));

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

  let thesisResult: ThesisResult;
  let thesisResultFull: ThesisResult | undefined;
  let thesisResultInsider: ThesisResult | undefined;
  let selectedThesis: string;
  let selectedThesisForFull: string;
  let selectedThesisInsider: string | undefined;
  let thesesList: ThesisCandidate[];
  let thesisError: boolean | undefined;
  let thesisErrorReason: string | undefined;

  if (outputMode === "bundle") {
    thesisResultFull = await runThesisEngine(leadsBlock, "full_issue");
    thesisResultInsider = await runThesisEngine(leadsBlock, "insider_access");
    selectedThesisForFull = thesisResultFull.selectedThesis;
    selectedThesisInsider = thesisResultInsider.selectedThesis;
    selectedThesis = selectedThesisForFull;
    thesesList = thesisResultFull.theses;
    thesisError = thesisResultFull.thesisError;
    thesisErrorReason = thesisResultFull.thesisErrorReason;
  } else {
    thesisResult = await runThesisEngine(leadsBlock, outputMode);
    selectedThesis = thesisResult.selectedThesis;
    selectedThesisForFull = thesisResult.selectedThesis;
    thesesList = thesisResult.theses;
    thesisError = thesisResult.thesisError;
    thesisErrorReason = thesisResult.thesisErrorReason;
  }

  const thesisPayload = (overrides?: Record<string, unknown>) => ({
    selectedThesis,
    theses: thesesList,
    ...(outputMode !== "bundle" && thesisResult && { selectedThesisSelectedBy: thesisResult.selectedBy ?? "editor" }),
    ...(thesisError && { thesisError: true, thesisErrorReason: thesisErrorReason ?? "Fallback used" }),
    ...overrides,
  });

  const bundleThesisPayload = () =>
    thesisResultFull && thesisResultInsider
      ? {
          selectedThesisFull: thesisResultFull.selectedThesis,
          selectedThesisInsider: thesisResultInsider.selectedThesis,
          selectedThesisFullSelectedBy: thesisResultFull.selectedBy ?? "editor",
          selectedThesisInsiderSelectedBy: thesisResultInsider.selectedBy ?? "editor",
          thesesFull: thesisResultFull.theses,
          thesesInsider: thesisResultInsider.theses,
          ...(thesisResultFull.thesisError && {
            thesisErrorFull: true,
            thesisErrorReasonFull: thesisResultFull.thesisErrorReason ?? "Fallback used",
          }),
          ...(thesisResultInsider.thesisError && {
            thesisErrorInsider: true,
            thesisErrorReasonInsider: thesisResultInsider.thesisErrorReason ?? "Fallback used",
          }),
        }
      : {};

  if (outputMode === "insider_access") {
    try {
      let insiderText = await generateInsiderDraft(leadsBlock, steering, selectedThesis);
      insiderText = applyDashReplaceMap(insiderText);
      let lintFixed = false;
      const lintViolations: LintViolation[] = [];
      const violations = lintDraft(insiderText);
      if (violations.length > 0) {
        try {
          insiderText = await rewriteLintViolations(insiderText, violations);
          lintFixed = true;
        } catch {
          // keep original on rewrite failure
        }
        lintViolations.push(...violations);
      }
      return NextResponse.json({
        ok: true,
        draft: insiderText || "(No content generated)",
        lintFixed,
        lintViolations,
        ...thesisPayload(),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ ok: false, error: message }, { status: 500 });
    }
  }

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

    const client = claudeClient();

    const { data: recentDrafts } = await supabase
      .from("issue_drafts")
      .select("content_json")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(5);
    const previousTitles = (recentDrafts ?? [])
      .map((d) => (d.content_json as Record<string, unknown>)?.title)
      .filter((t): t is string => typeof t === "string" && t.length > 0);

    const angle = await generateEditorialAngle({
      client,
      model: MODEL,
      max_tokens: MAX_TOKENS,
      brandProfile,
      leadsWithSources,
      previousTitles,
    });


    const userPrompt = `You are assembling a single newsletter issue draft in Identity Jedi (IDJ) voice.
    Use only the approved leads and their listed Sources URLs. Do not invent any sources or citations.

Primary Thesis:
${selectedThesisForFull}

Every section must reinforce this thesis. Avoid recap.

Editorial Steering Inputs (adjust Opening Hook, Deep Dive, and From the Dojo to match these):
- aggressionLevel: ${steering.aggressionLevel} (1-5)
- audienceLevel: ${steering.audienceLevel}
- focusArea: ${steering.focusArea}
- toneMode: ${steering.toneMode}

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

Output valid JSON only. No markdown code fence. No commentary. Use this exact shape (all strings; hook_paragraphs and dojo_checklist are arrays of strings):
{
  "title": "Max 6 words, no punctuation, reflects thesis",
  "hook_paragraphs": ["First short paragraph.", "Second paragraph.", "Optional third."],
  "fresh_signals": "**Fresh Signals**\\n\\n**Item 1 Title**\\n\\nTake text...\\n\\nSources:\\n- https://...\\n- https://...\\n\\n**Item 2 Title**\\n\\n...",
  "deep_dive": "Full Deep Dive prose (600-900 words). Use **bold** for 3 declarative statements.",
  "dojo_checklist": ["First bullet.", "Second.", "Third.", "Fourth.", "Fifth."]
}
Do not include promo_slot or close (they are added separately). Use only URLs from the leads for Sources.`;

    const systemPrompt = `You write in Identity Jedi (IDJ) voice.

Editorial Steering (behavior mapping). Change posture based on the steering values provided in the user message:
- aggressionLevel: 1-2 = measured, careful; 3 = confident, direct; 4-5 = sharp, provocative. Influences Opening Hook and Deep Dive tone.
- audienceLevel: practitioner = hands-on, tool-aware; ciso = risk and board language, strategic impact; board = business outcomes, minimal jargon. Influences Opening Hook and Deep Dive framing.
- focusArea: strategic = why and so-what, big picture; tactical = what to do Monday, concrete steps; architecture = systems, design, integration. Influences Deep Dive structure and From the Dojo specificity.
- toneMode: reflective = consider, weigh; confrontational = challenge, call out; analytical = break down, classify; strategic = position, recommend. Influences Opening Hook posture and Deep Dive argument style.

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
    Output strict JSON only. No code fences.`;

  type ClaudeSections = {
    title?: string;
    hook_paragraphs?: string[];
    fresh_signals?: string;
    deep_dive?: string;
    dojo_checklist?: string[];
  };

  let contentJson: DraftObject;
  try {
    const client = claudeClient();
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });
    const textBlock = msg.content?.find((b) => b.type === "text");
    const raw =
      textBlock && textBlock.type === "text"
        ? (textBlock as { type: "text"; text: string }).text.trim()
        : "";
    const stripped = raw.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
    const parsed = JSON.parse(stripped) as ClaudeSections;

    const title = typeof parsed.title === "string" ? parsed.title.trim() : "";
    const hook_paragraphs = Array.isArray(parsed.hook_paragraphs)
      ? parsed.hook_paragraphs.filter((x): x is string => typeof x === "string").map((s) => s.trim())
      : [];
    const fresh_signals = typeof parsed.fresh_signals === "string" ? parsed.fresh_signals.trim() : "";
    const deep_dive = typeof parsed.deep_dive === "string" ? parsed.deep_dive.trim() : "";
    const dojo_checklist = Array.isArray(parsed.dojo_checklist)
      ? parsed.dojo_checklist.filter((x): x is string => typeof x === "string").map((s) => s.trim())
      : [];

    const sources = (fresh_signals.match(/https?:\/\/[^\s)\]]+/g) ?? []);
    const uniqueSources = [...new Set(sources)];

    contentJson = {
      title,
      hook_paragraphs,
      fresh_signals,
      deep_dive,
      dojo_checklist,
      promo_slot: promoText,
      close: DEFAULT_CLOSE,
      sources: uniqueSources,
      metadata: { thesis: selectedThesisForFull, model: MODEL },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }

  let lintFixed = false;
  const lintViolations: LintViolation[] = [];

  async function lintAndFixSection(text: string): Promise<string> {
    let out = applyDashReplaceMap(text);
    const violations = lintDraft(out);
    if (violations.length > 0) {
      lintViolations.push(...violations);
      try {
        out = await rewriteLintViolations(out, violations);
        lintFixed = true;
      } catch {
        // keep original
      }
    }
    return out;
  }

  contentJson.hook_paragraphs = contentJson.hook_paragraphs.map((p) =>
    applyDashReplaceMap(p)
  );
  const hookCombined = contentJson.hook_paragraphs.join("\n\n");
  const hookViolations = lintDraft(hookCombined);
  if (hookViolations.length > 0) {
    lintViolations.push(...hookViolations);
    try {
      const fixed = await rewriteLintViolations(hookCombined, hookViolations);
      contentJson.hook_paragraphs = fixed.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
      lintFixed = true;
    } catch {
      // keep original
    }
  }

  contentJson.deep_dive = await lintAndFixSection(contentJson.deep_dive);
  contentJson.fresh_signals = await lintAndFixSection(contentJson.fresh_signals);
  contentJson.dojo_checklist = contentJson.dojo_checklist.map((b) => applyDashReplaceMap(b));

  const draftText = renderDraftMarkdown(contentJson);

  const usedLeadIds = curatedLeads.map((l) => l.id);

  let stored = false;
  let storeError: string | undefined;
  try {
    (contentJson as Record<string, unknown>).lead_ids = usedLeadIds;
    (contentJson as Record<string, unknown>).curation_rationale = curation.rationale;
    validateDraftObject(contentJson);
    const insertPayload: Record<string, unknown> = {
      workspace_id: workspaceId,
      brand_profile_id: brandProfileId,
      content: draftText,
      content_json: contentJson,
    };
    const { error: insertError } = await supabase.from("issue_drafts").insert(insertPayload);
    if (!insertError) {
      stored = true;
      await supabase
        .from("editorial_leads")
        .update({ status: "drafted" })
        .eq("workspace_id", workspaceId)
        .in("id", usedLeadIds);
    } else {
      storeError = insertError.message;
      if (process.env.NODE_ENV !== "production") {
        console.warn("[issue_drafts] insert failed:", insertError.message);
      }
    }
  } catch (e) {
    storeError = e instanceof Error ? e.message : String(e);
    if (process.env.NODE_ENV !== "production") {
      console.warn("[issue_drafts] insert threw:", e);
    }
  }

  if (outputMode === "bundle") {
    try {
      let insiderDraft = await generateInsiderDraft(leadsBlock, steering, selectedThesisInsider!);
      insiderDraft = applyDashReplaceMap(insiderDraft);
      const insiderViolations = lintDraft(insiderDraft);
      if (insiderViolations.length > 0) {
        try {
          insiderDraft = await rewriteLintViolations(insiderDraft, insiderViolations);
          lintFixed = true;
        } catch {
          // keep original insider draft on rewrite failure
        }
        lintViolations.push(...insiderViolations);
      }
      return NextResponse.json({
        ok: true,
        draft: draftText,
        insiderDraft: insiderDraft || "(No content generated)",
        stored,
        ...(storeError && { storeError }),
        lintFixed,
        lintViolations,
        curation: { leadsUsed: curatedLeads.length, leadsAvailable: allApproved.length, rationale: curation.rationale },
        ...bundleThesisPayload(),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ ok: false, error: message }, { status: 500 });
    }
  }

  return NextResponse.json({
    ok: true,
    draft: draftText,
    stored,
    ...(storeError && { storeError }),
    lintFixed,
    lintViolations,
    curation: { leadsUsed: curatedLeads.length, leadsAvailable: allApproved.length, rationale: curation.rationale },
    ...thesisPayload(),
  });
}
