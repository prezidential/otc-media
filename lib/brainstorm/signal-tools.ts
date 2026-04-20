import type { SupabaseClient } from "@supabase/supabase-js";
import { runCadenceIngest } from "@/lib/research/runCadenceIngest";

const MAX_LIMIT = 50;

export type BrainstormToolContext = {
  sessionId?: string;
};

export async function brainstormQuerySignals(
  supabase: SupabaseClient,
  workspaceId: string,
  params: Record<string, unknown>
): Promise<unknown> {
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(params.limit) || 20));
  const sinceDays = typeof params.since_days === "number" ? params.since_days : Number(params.sinceDays) || undefined;
  const directiveIdRaw = typeof params.directive_id === "string" ? params.directive_id.trim() : "";
  const directiveId = directiveIdRaw || undefined;

  let query = supabase
    .from("signals")
    .select("id,title,url,publisher,published_at,captured_at,normalized_summary,directive_id")
    .eq("workspace_id", workspaceId)
    .order("captured_at", { ascending: false })
    .limit(limit);

  if (directiveId) {
    query = query.eq("directive_id", directiveId);
  }
  if (sinceDays !== undefined && !Number.isNaN(sinceDays) && sinceDays > 0) {
    const since = new Date();
    since.setDate(since.getDate() - sinceDays);
    query = query.gte("captured_at", since.toISOString());
  }
  if (q) {
    const safe = q.replace(/%/g, "\\%").replace(/,/g, " ");
    query = query.ilike("title", `%${safe}%`);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return { signals: data ?? [], count: (data ?? []).length };
}

export async function brainstormGetSignal(
  supabase: SupabaseClient,
  workspaceId: string,
  params: Record<string, unknown>
): Promise<unknown> {
  const id = typeof params.id === "string" ? params.id : "";
  if (!id) throw new Error("get_signal requires params.id");

  const { data, error } = await supabase
    .from("signals")
    .select(
      "id,title,url,publisher,published_at,captured_at,normalized_summary,raw_text,directive_id,trust_score,tags_json"
    )
    .eq("workspace_id", workspaceId)
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return { error: "Signal not found or not in this workspace." };
  return { signal: data };
}

export async function brainstormListRecentDrafts(
  supabase: SupabaseClient,
  workspaceId: string,
  params: Record<string, unknown>
): Promise<unknown> {
  const limit = Math.min(25, Math.max(1, Number(params.limit) || 12));
  const { data, error } = await supabase
    .from("issue_drafts")
    .select("id,created_at,content_json")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  const rows = (data ?? []).map((r: { id: string; created_at: string; content_json: unknown }) => {
    const cj = r.content_json as Record<string, unknown> | null;
    const title = typeof cj?.title === "string" ? cj.title : "(untitled)";
    return { id: r.id, created_at: r.created_at, title };
  });
  return { drafts: rows };
}

async function mergeSessionArtifact(
  supabase: SupabaseClient,
  workspaceId: string,
  sessionId: string,
  patch: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const { data: row, error: selErr } = await supabase
    .from("brainstorm_sessions")
    .select("artifact_json")
    .eq("id", sessionId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (selErr) throw new Error(selErr.message);
  const base =
    row?.artifact_json && typeof row.artifact_json === "object" && !Array.isArray(row.artifact_json)
      ? (row.artifact_json as Record<string, unknown>)
      : {};
  const next = { ...base, ...patch };
  const { error: upErr } = await supabase
    .from("brainstorm_sessions")
    .update({ artifact_json: next, updated_at: new Date().toISOString() })
    .eq("id", sessionId)
    .eq("workspace_id", workspaceId);
  if (upErr) throw new Error(upErr.message);
  return next;
}

export async function executeBrainstormTool(
  supabase: SupabaseClient,
  workspaceId: string,
  tool: string,
  params: Record<string, unknown>,
  ctx: BrainstormToolContext = {}
): Promise<unknown> {
  if (tool === "query_signals") {
    return brainstormQuerySignals(supabase, workspaceId, params);
  }
  if (tool === "get_signal") {
    return brainstormGetSignal(supabase, workspaceId, params);
  }
  if (tool === "list_recent_drafts") {
    return brainstormListRecentDrafts(supabase, workspaceId, params);
  }

  if (tool === "trigger_signal_ingest") {
    const cadence = params.cadence === "weekly" ? "weekly" : "daily";
    const limitPerFeed = Math.min(30, Math.max(5, Number(params.limit_per_feed) || Number(params.limitPerFeed) || 12));
    const result = await runCadenceIngest(supabase, workspaceId, cadence, limitPerFeed, {
      source: "brainstorm_tool_trigger_signal_ingest",
    });
    return {
      ok: result.ok,
      cadence,
      limit_per_feed: limitPerFeed,
      inserted: result.inserted,
      skipped: result.skipped,
      details: result.details,
      error: result.error,
      run_id: result.run_id,
    };
  }

  if (tool === "propose_manual_signal") {
    if (!ctx.sessionId) throw new Error("propose_manual_signal requires an active brainstorm session");
    const title = typeof params.title === "string" ? params.title.trim() : "";
    if (!title) throw new Error("propose_manual_signal requires params.title");
    const url = typeof params.url === "string" ? params.url.trim() : "";
    const notes = typeof params.notes === "string" ? params.notes.trim() : "";
    const pending = { title, url: url || undefined, notes: notes || undefined };
    await mergeSessionArtifact(supabase, workspaceId, ctx.sessionId, {
      pending_manual_signal: pending,
    });
    return {
      ok: true,
      awaiting_human_confirmation: true,
      pending_manual_signal: pending,
      hint: "The creator can click **Insert signal** on the Brainstorm page to add it to the workspace, or dismiss it.",
    };
  }

  if (tool === "save_artifact_draft") {
    if (!ctx.sessionId) throw new Error("save_artifact_draft requires an active brainstorm session");
    const outline =
      typeof params.outline === "string"
        ? params.outline
        : typeof params.working_outline === "string"
          ? params.working_outline
          : "";
    const key_claims = params.key_claims;
    const cited_signal_ids = params.cited_signal_ids;
    const thesis = typeof params.thesis === "string" ? params.thesis : undefined;
    const artifact = {
      working_outline: outline || undefined,
      key_claims: key_claims ?? undefined,
      cited_signal_ids: cited_signal_ids ?? undefined,
      thesis: thesis ?? undefined,
      saved_at: new Date().toISOString(),
    };
    const next = await mergeSessionArtifact(supabase, workspaceId, ctx.sessionId, {
      working_artifact: artifact,
    });
    return { ok: true, artifact: next.working_artifact };
  }

  throw new Error(`Unknown tool: ${tool}`);
}
