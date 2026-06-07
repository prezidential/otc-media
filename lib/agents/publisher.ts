import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isBeehiivEnabled,
  createBeehiivDraft,
  type BeehiivPostResult,
} from "@/lib/publish/beehiiv";
import { renderDraftHtml } from "@/lib/publish/renderHtml";
import type { DraftContentJson } from "@/lib/draft/content";
import { getProviderFromEnv } from "@/lib/notifications/factory";

/**
 * Publisher Agent — completes the Researcher → Writer → Editor → Publisher chain.
 *
 * Per spec §7 this agent is DETERMINISTIC (no LLM): it renders a finished draft
 * and pushes it to the configured distribution channel (Beehiiv today; LinkedIn
 * is a Phase 2 channel). It does NOT use the LLM-driven `runAgent` loop.
 *
 * Human gate: publishing is human-triggered (the human reviews the draft on the
 * Issues page and clicks publish). The act of triggering IS the gate — this agent
 * does not auto-publish on a schedule. The draft's pre-publish status is recorded
 * in the run decisions for audit, and the draft is marked `published` on success.
 *
 * The caller persists the outcome via `saveAgentRun({ agent_id: "publisher", ... })`
 * so the run surfaces in the /runs dashboard as the final stage of the pipeline.
 */

export type PublisherFailureCode =
  | "disabled"
  | "not_found"
  | "no_content"
  | "publish_failed";

export type PublisherResult =
  | {
      ok: true;
      beehiiv: BeehiivPostResult;
      decisions: string[];
      summary: string;
      /** Whether this outcome should be logged as an agent run in /runs. */
      loggable: true;
    }
  | {
      ok: false;
      code: PublisherFailureCode;
      error: string;
      decisions: string[];
      summary: string;
      /** disabled/not_found/no_content are pre-flight; only publish_failed is a real run. */
      loggable: boolean;
    };

export type PublisherInput = {
  workspaceId: string;
  /** Workspace-scoped (RLS) client from requireWorkspace(). */
  supabase: SupabaseClient;
  draftId: string;
};

/** render_html — convert a structured draft into newsletter-ready HTML. */
function renderHtmlStep(contentJson: DraftContentJson): {
  html: string;
  title: string;
  subtitle?: string;
} {
  const html = renderDraftHtml(contentJson);
  const title = contentJson.title || "Untitled Issue";
  const subtitle = contentJson.metadata?.thesis || undefined;
  return { html, title, subtitle };
}

/**
 * After a successful push, mark the draft as published, close out any matching
 * ACE run, and fire a best-effort success notification. Mirrors the side effects
 * the legacy publish route performed, kept here so all publish logic lives in the agent.
 */
async function recordPublication(
  input: PublisherInput,
  beehiiv: BeehiivPostResult
): Promise<void> {
  const { supabase, workspaceId, draftId } = input;

  // Draft status lifecycle: draft → reviewed → published.
  await supabase
    .from("issue_drafts")
    .update({ status: "published" })
    .eq("id", draftId)
    .eq("workspace_id", workspaceId);

  const { data: approvalRow } = await supabase
    .from("notification_approvals")
    .select("id")
    .eq("entity_id", draftId)
    .eq("entity_type", "newsletter_draft")
    .eq("status", "approved")
    .maybeSingle();

  if (!approvalRow?.id) return;

  const { data: aceRun } = await supabase
    .from("ace_runs")
    .select("id")
    .eq("approval_id", approvalRow.id)
    .maybeSingle();

  if (!aceRun?.id) return;

  await supabase
    .from("ace_runs")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      summary: `Published to Beehiiv: ${beehiiv.title}`,
    })
    .eq("id", aceRun.id as string);

  try {
    const provider = getProviderFromEnv();
    await provider.sendStatusUpdate({
      level: "success",
      title: "Published",
      body: beehiiv.title,
      url: beehiiv.web_url || undefined,
    });
  } catch {
    /* notifications are optional */
  }
}

/**
 * Run the Publisher Agent against a single reviewed draft.
 * Deterministic: fetch → render_html → push_beehiiv → mark published.
 */
export async function runPublisher(input: PublisherInput): Promise<PublisherResult> {
  const { supabase, workspaceId, draftId } = input;
  const decisions: string[] = [];

  // push_beehiiv is feature-flagged — bail before touching any data when disabled.
  if (!isBeehiivEnabled()) {
    return {
      ok: false,
      code: "disabled",
      error:
        "Beehiiv integration is not enabled. Set BEEHIIV_ENABLED=true in your environment.",
      decisions,
      summary: "Publish skipped: Beehiiv disabled",
      loggable: false,
    };
  }

  const { data: draft, error } = await supabase
    .from("issue_drafts")
    .select("id, content_json, status")
    .eq("id", draftId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      code: "not_found",
      error: error.message,
      decisions,
      summary: "Publish failed: could not load draft",
      loggable: false,
    };
  }
  if (!draft) {
    return {
      ok: false,
      code: "not_found",
      error: "Draft not found",
      decisions,
      summary: "Publish failed: draft not found",
      loggable: false,
    };
  }

  const contentJson = (draft.content_json as DraftContentJson | null) ?? null;
  if (!contentJson) {
    return {
      ok: false,
      code: "no_content",
      error: "Draft has no structured content",
      decisions,
      summary: "Publish failed: draft has no structured content",
      loggable: false,
    };
  }

  // Human gate: publishing is human-triggered; record the reviewed-state for audit.
  const priorStatus = (draft.status as string | undefined) ?? "draft";
  decisions.push(`Human-gated publish for draft ${draftId} (status: ${priorStatus})`);

  const { html, title, subtitle } = renderHtmlStep(contentJson);
  decisions.push(`render_html: produced ${html.length} chars for "${title}"`);

  let beehiiv: BeehiivPostResult;
  try {
    beehiiv = await createBeehiivDraft({ title, subtitle, htmlContent: html });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      code: "publish_failed",
      error: message,
      decisions,
      summary: `Publish failed for "${title}": ${message}`,
      loggable: true,
    };
  }

  decisions.push(`push_beehiiv: created post ${beehiiv.id} (${beehiiv.status})`);

  await recordPublication(input, beehiiv);
  decisions.push(`Marked draft ${draftId} as published`);

  return {
    ok: true,
    beehiiv,
    decisions,
    summary: `Published "${beehiiv.title}" to Beehiiv`,
    loggable: true,
  };
}
