import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { claudeClient } from "@/lib/llm/claude";
import {
  applyDashReplaceMap,
  lintDraft,
  rewriteLintViolations,
} from "@/lib/draft/lint";
import { createDraftContent, renderDraftMarkdown, validateDraftObject, type DraftObject, type DraftContentJson } from "@/lib/draft/content";
import {
  getSectionBlocks,
  parseDraftToStructured,
  emptyContentJson,
  type RegeneratableSection,
} from "@/lib/draft/parse";

const MODEL = "claude-sonnet-4-20250514";
const MAX_TOKENS = 4092;
const LINT_RETRIES = 2;

const SECTION_HEADERS: Record<RegeneratableSection, string> = {
  title: "1) Title",
  hook: "2) Opening Hook",
  deep_dive: "4) Deep Dive",
  dojo_checklist: "5) From the Dojo",
};

function getSectionBodyFromContent(content: string, section: RegeneratableSection): string {
  const blocks = getSectionBlocks(content);
  const idx = section === "title" ? 0 : section === "hook" ? 1 : section === "deep_dive" ? 3 : 4;
  if (idx >= blocks.length) return "";
  const block = blocks[idx];
  const firstNewline = block.indexOf("\n");
  if (firstNewline === -1) return "";
  return block.slice(firstNewline + 1).trim();
}

function buildSectionOutput(
  section: RegeneratableSection,
  newBody: string,
  json: DraftContentJson
): Partial<DraftContentJson> {
  if (section === "title") return { title: newBody.trim().split("\n")[0] ?? "" };
  if (section === "hook") {
    const paragraphs = newBody.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
    return { hook_paragraphs: paragraphs };
  }
  if (section === "deep_dive") return { deep_dive: newBody.trim() };
  if (section === "dojo_checklist") {
    const bullets = newBody
      .split(/\n/)
      .map((l) => l.replace(/^[-*]\s*/, "").trim())
      .filter(Boolean);
    return { dojo_checklist: bullets };
  }
  return {};
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const draftId = (body.draftId ?? body.draft_id) as string | undefined;
  const section = body.section as RegeneratableSection | undefined;
  const instruction = typeof body.instruction === "string" ? body.instruction.trim() : "";

  const validSections: RegeneratableSection[] = ["title", "hook", "deep_dive", "dojo_checklist"];
  if (!draftId) {
    return NextResponse.json({ error: "draftId required" }, { status: 400 });
  }
  if (!section || !validSections.includes(section)) {
    return NextResponse.json(
      { error: "section required: one of title, hook, deep_dive, dojo_checklist" },
      { status: 400 }
    );
  }

  const workspaceId = process.env.WORKSPACE_ID!;
  const supabase = supabaseAdmin();

  const { data: draftRow, error: draftError } = await supabase
    .from("issue_drafts")
    .select("id, content, content_json, brand_profile_id")
    .eq("id", draftId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (draftError) {
    return NextResponse.json({ error: draftError.message }, { status: 500 });
  }
  if (!draftRow) {
    return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  }

  const content = (draftRow.content as string) ?? "";
  let contentJson = draftRow.content_json as DraftContentJson | null;
  const brandProfileId = draftRow.brand_profile_id as string | null;

  if (!content) {
    return NextResponse.json(
      { error: "Draft has no content. Generate a new draft first." },
      { status: 400 }
    );
  }
  if (!contentJson || typeof contentJson !== "object") {
    contentJson = parseDraftToStructured(content, {}) ?? emptyContentJson({});
  }
  if (!brandProfileId) {
    return NextResponse.json({ error: "Draft has no brand profile" }, { status: 400 });
  }

  const { data: brandProfile, error: profileError } = await supabase
    .from("brand_profiles")
    .select("id, name, voice_rules_json, formatting_rules_json, forbidden_patterns_json, emoji_policy_json, narrative_preferences_json")
    .eq("id", brandProfileId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (profileError || !brandProfile) {
    return NextResponse.json({ error: "Brand profile not found" }, { status: 404 });
  }

  const { data: leads, error: leadsError } = await supabase
    .from("editorial_leads")
    .select("id, angle, why_now, who_it_impacts, contrarian_take, created_at")
    .eq("workspace_id", workspaceId)
    .eq("status", "approved")
    .order("created_at", { ascending: false })
    .limit(6);

  if (leadsError) {
    return NextResponse.json({ error: leadsError.message }, { status: 500 });
  }

  function extractSourcesFromContrarianTake(contrarian_take: string): string[] {
    const match =
      contrarian_take.match(/\n\nSources:\s*\n([\s\S]*?)(?=\n\n|$)/i) ||
      contrarian_take.match(/Sources:\s*\n([\s\S]*?)(?=\n\n|$)/i);
    if (!match) return [];
    return match[1]
      .trim()
      .split(/\n/)
      .map((line) => line.replace(/^[-*]\s*/, "").trim())
      .filter((line) => line.startsWith("http://") || line.startsWith("https://"));
  }

  const approvedLeads = leads ?? [];
  const leadsWithSources = approvedLeads.map((lead) => {
    const sources = extractSourcesFromContrarianTake(lead.contrarian_take ?? "");
    const takeWithoutSources = (lead.contrarian_take ?? "").replace(
      /\n\nSources:\s*\n[\s\S]*/i,
      ""
    ).trim();
    return {
      angle: lead.angle,
      why_now: lead.why_now,
      who_it_impacts: lead.who_it_impacts,
      contrarian_take: takeWithoutSources,
      sources,
    };
  });

  const leadsBlock = leadsWithSources
    .map(
      (l, i) =>
        `[Lead ${i + 1}]
Angle: ${l.angle}
Why now: ${l.why_now}
Who it impacts: ${l.who_it_impacts}
Take: ${l.contrarian_take}
Sources: ${l.sources.join(", ") || "(none)"}`
    )
    .join("\n\n");

  const sectionHeader = SECTION_HEADERS[section];
  const currentBody = getSectionBodyFromContent(content, section);

  const systemPrompt = `You are the Identity Jedi Editor. You regenerate a single section of a newsletter draft.
Rules: No em dash (—) or en dash (–). No space-dash-space in prose. Avoid "the real issue is", "the real risk is", "the real problem is". Keep paragraphs to 1-2 sentences. Output ONLY the new section body (no section header, no meta commentary).`;

  const userPrompt = `BRAND PROFILE (voice/formatting):
${JSON.stringify({
  voice_rules_json: brandProfile.voice_rules_json,
  formatting_rules_json: brandProfile.formatting_rules_json,
  forbidden_patterns_json: brandProfile.forbidden_patterns_json,
}, null, 2)}

RESEARCH CONTEXT (approved leads):
${leadsBlock}

CURRENT FULL DRAFT (for continuity):
---
${content}
---

REGENERATE ONLY THIS SECTION: ${sectionHeader}

Current content of this section:
---
${currentBody}
---

User instruction: ${instruction || "Improve or refine this section while keeping the same thesis and voice."}

Return ONLY the new section body. Do not include the section number or title (e.g. do not include "4) Deep Dive"). For "title", return a single line (max 6 words). For "hook", return 2-3 short paragraphs. For "deep_dive", return the full Deep Dive prose (600-900 words). For "dojo_checklist", return exactly 5 bullet lines (plain text, one per line).`;

  let newBody = "";
  try {
    const client = claudeClient();
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });
    const textBlock = msg.content?.find((b) => b.type === "text");
    newBody =
      textBlock && textBlock.type === "text"
        ? (textBlock as { type: "text"; text: string }).text.trim()
        : "";
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }

  if (!newBody) {
    return NextResponse.json({ ok: false, error: "No content generated for section" }, { status: 500 });
  }

  newBody = applyDashReplaceMap(newBody);
  for (let attempt = 0; attempt <= LINT_RETRIES; attempt++) {
    const violations = lintDraft(newBody);
    if (violations.length === 0) break;
    if (attempt < LINT_RETRIES) {
      try {
        newBody = await rewriteLintViolations(newBody, violations);
      } catch {
        break;
      }
    }
  }

  const updatedJson: DraftContentJson = {
    ...contentJson,
    ...buildSectionOutput(section, newBody, contentJson),
  };

  validateDraftObject(updatedJson);

  const updatedContent = renderDraftMarkdown(updatedJson);

  const { error: updateError } = await supabase
    .from("issue_drafts")
    .update({
      content: updatedContent,
      content_json: updatedJson,
    })
    .eq("id", draftId)
    .eq("workspace_id", workspaceId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    draft: updatedContent,
    content_json: updatedJson,
  });
}
