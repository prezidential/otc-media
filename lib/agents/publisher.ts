import type { SupabaseClient } from "@supabase/supabase-js";
import { isBeehiivEnabled, type BeehiivPostResult } from "@/lib/publish/beehiiv";
import {
  publishBeehiivPost,
  type BeehiivPublishOutcome,
} from "@/lib/integrations/beehiiv/write";
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
      /** Whether the Beehiiv draft was created fresh or updated in place. */
      action: "create" | "update";
      /**
       * Set when the draft is marked as needing a paywall break. Beehiiv has no
       * API to insert it, so this reminds the human to set it in the editor.
       */
      paywallReminder?: string;
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
  /** Current user id — lets the Beehiiv write path use the per-workspace OAuth token. */
  userId?: string;
  /** App origin for OAuth client/token lookups during MCP write. */
  origin?: string;
};

/** Visible placeholder rendered into the HTML at the paywall break point. */
const PAYWALL_MARKER = "<!-- PAYWALL BREAK HERE -->";

/**
 * render_html — convert a structured draft into newsletter-ready HTML.
 *
 * If the issue is marked as needing a paywall (`paywall_after_section`), insert a
 * VISIBLE marker comment into the HTML and return a reminder. We do NOT attempt
 * to create the real Beehiiv paywall block — there is no API/MCP primitive for
 * it; the human sets it in the editor. Mark, don't fake.
 */
function renderHtmlStep(contentJson: DraftContentJson): {
  html: string;
  title: string;
  subtitle?: string;
  seo?: Record<string, unknown>;
  previewText?: string;
  paywallReminder?: string;
} {
  let html = renderDraftHtml(contentJson);
  const title = contentJson.title || "Untitled Issue";
  const subtitle = contentJson.metadata?.thesis || undefined;
  const seo = contentJson.metadata?.seo;
  const previewText = contentJson.metadata?.preview_text || undefined;

  let paywallReminder: string | undefined;
  const paywallSection = contentJson.paywall_after_section?.trim();
  if (paywallSection) {
    html = `${html}\n\n${PAYWALL_MARKER}`;
    paywallReminder =
      `Paywall break marked after "${paywallSection}". Beehiiv's API cannot insert it — ` +
      `set the paywall break manually in the Beehiiv editor before sending.`;
  }

  return { html, title, subtitle, seo, previewText, paywallReminder };
}

/**
 * After a successful push, mark the draft as published, close out any matching
 * ACE run, and fire a best-effort success notification. Mirrors the side effects
 * the legacy publish route performed, kept here so all publish logic lives in the agent.
 */
async function recordPublication(
  input: PublisherInput,
  beehiiv: BeehiivPostResult,
  contentJson: DraftContentJson
): Promise<void> {
  const { supabase, workspaceId, draftId } = input;

  // Persist the Beehiiv post id INSIDE content_json.metadata so re-publishing the
  // same issue edits that post instead of creating a duplicate (create-once,
  // edit-many). Stored in existing JSON to avoid a schema migration.
  const nextContentJson: DraftContentJson = {
    ...contentJson,
    metadata: { ...contentJson.metadata, beehiiv_post_id: beehiiv.id },
  };

  // Draft status lifecycle: draft → reviewed → published.
  await supabase
    .from("issue_drafts")
    .update({ status: "published", content_json: nextContentJson })
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

  const { html, title, subtitle, seo, previewText, paywallReminder } =
    renderHtmlStep(contentJson);
  decisions.push(`render_html: produced ${html.length} chars for "${title}"`);
  if (paywallReminder) decisions.push(`paywall: ${paywallReminder}`);

  // create-once, edit-many: reuse a stored Beehiiv post id when present so a
  // re-publish updates the same post instead of making a duplicate.
  const existingPostId = contentJson.metadata?.beehiiv_post_id ?? null;
  if (existingPostId) {
    decisions.push(`reuse_post: editing existing Beehiiv post ${existingPostId}`);
  }

  let outcome: BeehiivPublishOutcome;
  try {
    outcome = await publishBeehiivPost(
      { title, subtitle, htmlContent: html, seo, previewText },
      {
        existingPostId,
        ctx: input.userId
          ? {
              workspaceId,
              userId: input.userId,
              supabase,
              origin: input.origin,
            }
          : undefined,
      }
    );
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

  const beehiiv: BeehiivPostResult = {
    id: outcome.id,
    title: outcome.title,
    status: outcome.status,
    web_url: outcome.web_url,
  };
  const verb = outcome.action === "update" ? "updated" : "created";
  decisions.push(
    `push_beehiiv: ${verb} post ${beehiiv.id} (${beehiiv.status}) via ${outcome.transport}`
  );

  await recordPublication(input, beehiiv, contentJson);
  decisions.push(`Marked draft ${draftId} as published`);

  return {
    ok: true,
    beehiiv,
    action: outcome.action,
    ...(paywallReminder ? { paywallReminder } : {}),
    decisions,
    summary: `${verb === "updated" ? "Updated" : "Published"} "${beehiiv.title}" on Beehiiv`,
    loggable: true,
  };
}
