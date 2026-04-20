import type { SupabaseClient } from "@supabase/supabase-js";
import { callLLM, getModelForRole } from "@/lib/llm/provider";
import { validateDraftObject, renderDraftMarkdown, type DraftObject } from "@/lib/draft/content";

function stripCodeFences(text: string): string {
  return text.replace(/^```(?:json)?\s*|\s*```$/gim, "").trim();
}

function parseDraftJsonFromLlm(text: string): unknown {
  const stripped = stripCodeFences(text);
  try {
    return JSON.parse(stripped);
  } catch {
    const start = stripped.indexOf("{");
    const end = stripped.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(stripped.slice(start, end + 1));
    }
    throw new Error("Model did not return a JSON object for DraftObject");
  }
}

async function fetchSignalSnippets(
  supabase: SupabaseClient,
  workspaceId: string,
  ids: unknown
): Promise<string> {
  if (!Array.isArray(ids) || ids.length === 0) return "";
  const uuidList = ids.filter((x): x is string => typeof x === "string" && x.length > 0).slice(0, 12);
  if (uuidList.length === 0) return "";
  const { data, error } = await supabase
    .from("signals")
    .select("id,title,url,normalized_summary")
    .eq("workspace_id", workspaceId)
    .in("id", uuidList);
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  return rows
    .map(
      (r: { id: string; title: string; url: string | null; normalized_summary: string | null }) =>
        `- **${r.title}** (${r.url ?? "no url"})\n  ${(r.normalized_summary ?? "").slice(0, 600)}`
    )
    .join("\n");
}

/**
 * Maps a session's `artifact_json.working_artifact` into a validated `DraftObject` and inserts `issue_drafts`.
 */
export async function promoteBrainstormSessionToIssueDraft(opts: {
  supabase: SupabaseClient;
  workspaceId: string;
  sessionId: string;
  artifactJson: Record<string, unknown>;
  brandProfileId: string;
}): Promise<{ draftId: string; contentJson: DraftObject }> {
  const { supabase, workspaceId, sessionId, artifactJson, brandProfileId } = opts;
  const working = artifactJson.working_artifact;
  if (!working || typeof working !== "object") {
    throw new Error("Nothing to promote: save an artifact with save_artifact_draft first.");
  }
  const wa = working as Record<string, unknown>;
  const cited = wa.cited_signal_ids;

  const signalBlock = await fetchSignalSnippets(supabase, workspaceId, cited);
  const { model } = getModelForRole("drafting");

  const userPayload = {
    working_artifact: wa,
    cited_signals_context: signalBlock || "(none)",
    session_id: sessionId,
  };

  const system = `You convert a brainstorm working artifact into a single valid newsletter DraftObject (JSON only).
Every required field must be a non-empty string or non-empty array as specified.
Return ONLY JSON, no markdown fences.

DraftObject shape:
- title: string
- hook_paragraphs: string[] (2–4 short paragraphs)
- fresh_signals: string (markdown prose summarizing cited signals / news)
- deep_dive: string (markdown body)
- dojo_checklist: string[] (exactly 5 short checklist strings)
- promo_slot: string (one paragraph CTA / subscribe nudge)
- close: string (sign-off + subscribe reminder)
- sources: string[] (URLs as plain strings; use signal URLs when available)
- metadata: { "model": string (use exactly: ${JSON.stringify(model)}), "thesis": string (one-line thesis) }`;

  const { text } = await callLLM(
    "drafting",
    [
      { role: "system", content: system },
      {
        role: "user",
        content: `Map this brainstorm artifact into DraftObject JSON:\n${JSON.stringify(userPayload, null, 2)}`,
      },
    ],
    { max_tokens: 8192, temperature: 0.35 }
  );

  const raw = parseDraftJsonFromLlm(text);
  const contentJson = validateDraftObject(raw);
  const markdown = renderDraftMarkdown(contentJson);

  const { data: inserted, error } = await supabase
    .from("issue_drafts")
    .insert({
      workspace_id: workspaceId,
      brand_profile_id: brandProfileId,
      content: markdown,
      content_json: contentJson,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  if (!inserted?.id) throw new Error("Insert succeeded but no draft id returned");

  return { draftId: inserted.id as string, contentJson };
}
