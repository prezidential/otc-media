import { supabaseAdmin } from "@/lib/supabase/server";
import { getLaneBalance } from "@/lib/ace/lane-balance";
import { getProviderFromEnv } from "@/lib/notifications/factory";
import { opsLog } from "@/lib/ops/log";
import type { DraftContentJson } from "@/lib/draft/content";

export type AceRunOptions = {
  workspaceId: string;
  trigger: "cron" | "manual" | "api";
  forceRerun?: boolean;
};

export type AceRunResult = {
  runId: string;
  status: "completed" | "awaiting_approval" | "skipped" | "failed";
  summary: string;
  draftId?: string;
  approvalId?: string;
  error?: string;
};

const STALE_MS = 20 * 60 * 60 * 1000;

function internalOrigin(): string {
  if (process.env.INTERNAL_APP_URL) return process.env.INTERNAL_APP_URL.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

export async function runAce(options: AceRunOptions): Promise<AceRunResult> {
  const { workspaceId, trigger, forceRerun } = options;
  const supabase = supabaseAdmin();

  if (process.env.ACE_ENABLED !== "true") {
    return { runId: "", status: "skipped", summary: "ACE disabled" };
  }

  if (!forceRerun) {
    const { data: pending } = await supabase
      .from("notification_approvals")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("status", "pending")
      .limit(1)
      .maybeSingle();

    if (pending?.id) {
      return { runId: "", status: "skipped", summary: "Awaiting approval on existing draft" };
    }

    const sinceIso = new Date(Date.now() - STALE_MS).toISOString();
    const { data: recent } = await supabase
      .from("ace_runs")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("status", "completed")
      .gte("completed_at", sinceIso)
      .limit(1)
      .maybeSingle();

    if (recent?.id) {
      return { runId: "", status: "skipped", summary: "Pipeline ran recently" };
    }
  }

  const { data: runRow, error: runInsertErr } = await supabase
    .from("ace_runs")
    .insert({
      workspace_id: workspaceId,
      run_trigger: trigger,
      status: "running",
    })
    .select("id")
    .single();

  if (runInsertErr || !runRow?.id) {
    const msg = runInsertErr?.message ?? "ace_runs insert failed";
    opsLog("ace.run_insert_failed", { msg }, "error");
    return { runId: "", status: "failed", summary: msg, error: msg };
  }

  const runId = runRow.id as string;

  const fail = async (summary: string, err?: string): Promise<AceRunResult> => {
    if (runId) {
      await supabase
        .from("ace_runs")
        .update({
          status: "failed",
          completed_at: new Date().toISOString(),
          summary,
          ...(err && { error: err }),
        })
        .eq("id", runId);
    }
    try {
      const provider = getProviderFromEnv();
      await provider.sendStatusUpdate({ level: "error", title: "ACE pipeline failed", body: summary });
    } catch {
      /* notification misconfigured */
    }
    return { runId, status: "failed", summary, error: err ?? summary };
  };

  const laneBalance = await getLaneBalance(workspaceId);
  const origin = internalOrigin();

  let pipelineJson: {
    ok?: boolean;
    aborted?: boolean;
    draftId?: string | null;
    stages?: Record<string, { success?: boolean; summary?: string }>;
  };
  try {
    const res = await fetch(`${origin}/api/pipeline/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        stages: ["researcher", "writer", "editor"],
        triggered_by: `ace:${trigger}`,
        returnDraftId: true,
        laneBalanceContext: laneBalance,
      }),
    });
    pipelineJson = (await res.json().catch(() => ({}))) as typeof pipelineJson;
    if (!res.ok) {
      return fail(`Pipeline HTTP ${res.status}`);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return fail(msg, msg);
  }

  if (!pipelineJson.ok || pipelineJson.aborted) {
    const editorSummary = pipelineJson.stages?.editor?.summary ?? "Pipeline did not complete";
    return fail(editorSummary, editorSummary);
  }

  const draftId = pipelineJson.draftId ?? undefined;
  if (!draftId) {
    const leadHint = "Not enough approved material or editor stopped before a stored draft.";
    await supabase
      .from("ace_runs")
      .update({
        status: "skipped",
        completed_at: new Date().toISOString(),
        summary: leadHint,
      })
      .eq("id", runId);
    try {
      const provider = getProviderFromEnv();
      await provider.sendStatusUpdate({
        level: "info",
        title: "ACE ran — no draft stored",
        body: leadHint,
      });
    } catch {
      /* optional */
    }
    return { runId, status: "skipped", summary: leadHint };
  }

  const { data: draft, error: draftErr } = await supabase
    .from("issue_drafts")
    .select("id, content_json, content_lane_id, brand_profile_id")
    .eq("id", draftId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (draftErr || !draft) {
    return fail("Draft not found after pipeline");
  }

  const json = draft.content_json as DraftContentJson | null;
  const hook0 = json?.hook_paragraphs?.[0] ?? "";
  const hook1 = json?.hook_paragraphs?.[1] ?? "";
  const thesis = json?.metadata?.thesis ?? json?.title ?? "";

  let laneName: string | undefined;
  if (draft.content_lane_id) {
    const { data: lane } = await supabase
      .from("content_lanes")
      .select("name")
      .eq("id", draft.content_lane_id)
      .maybeSingle();
    laneName = lane?.name as string | undefined;
  }

  let channel = "Newsletter";
  if (draft.brand_profile_id) {
    const { data: bp } = await supabase.from("brand_profiles").select("name").eq("id", draft.brand_profile_id).maybeSingle();
    if (bp?.name) channel = String(bp.name);
  }

  const previewLines = [hook0, hook1, thesis].filter((s) => s.length > 0);
  const previewText = previewLines.join("\n\n").slice(0, 8000);

  const { data: approvalRow, error: apprErr } = await supabase
    .from("notification_approvals")
    .insert({
      workspace_id: workspaceId,
      provider: "telegram",
      entity_type: "newsletter_draft",
      entity_id: draftId,
      status: "pending",
      preview_text: previewText || "(no preview)",
    })
    .select("id")
    .single();

  if (apprErr || !approvalRow?.id) {
    return fail(apprErr?.message ?? "notification_approvals insert failed");
  }

  const approvalId = approvalRow.id as string;

  try {
    const provider = getProviderFromEnv();
    const { messageRef } = await provider.sendApprovalRequest({
      approvalId,
      entityType: "newsletter_draft",
      entityId: draftId,
      headline: "Newsletter Draft Ready",
      previewLines: previewLines.length > 0 ? previewLines : ["(open dashboard for full draft)"],
      channel,
      contentLane: laneName,
    });

    await supabase.from("notification_approvals").update({ provider_message_ref: messageRef }).eq("id", approvalId);

    await supabase
      .from("ace_runs")
      .update({
        status: "awaiting_approval",
        draft_id: draftId,
        approval_id: approvalId,
        summary: "Awaiting Telegram approval",
      })
      .eq("id", runId);

    return {
      runId,
      status: "awaiting_approval",
      summary: "Sent approval request",
      draftId,
      approvalId,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await supabase.from("notification_approvals").update({ status: "expired" }).eq("id", approvalId);
    return fail(`Notification send failed: ${msg}`, msg);
  }
}
