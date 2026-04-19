import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getNotificationProvider } from "@/lib/notifications/factory";
import { createBeehiivDraft, isBeehiivEnabled } from "@/lib/publish/beehiiv";
import { renderDraftHtml } from "@/lib/publish/renderHtml";
import type { DraftContentJson } from "@/lib/draft/content";
import { opsLog } from "@/lib/ops/log";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ provider: string }> }
): Promise<NextResponse> {
  const { provider: providerSlug } = await ctx.params;
  const rawBody = await req.text();
  let body: unknown;
  try {
    body = JSON.parse(rawBody) as unknown;
  } catch {
    body = {};
  }

  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => {
    headers[k.toLowerCase()] = v;
  });

  try {
    if (providerSlug !== "telegram") {
      opsLog("notification_webhook.unsupported_provider", { provider: providerSlug }, "warn");
      return NextResponse.json({ ok: true });
    }

    const notificationProvider = getNotificationProvider();
    if (!notificationProvider.handleInbound) {
      return NextResponse.json({ ok: true });
    }

    let response: Awaited<ReturnType<NonNullable<typeof notificationProvider.handleInbound>>> = null;
    try {
      response = await notificationProvider.handleInbound(body, headers);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("Invalid Telegram webhook secret")) {
        return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
      }
      throw e;
    }

    if (!response) {
      return NextResponse.json({ ok: true });
    }

    const supabase = supabaseAdmin();
    const workspaceId = process.env.WORKSPACE_ID!;

    const { data: row, error: loadErr } = await supabase
      .from("notification_approvals")
      .select("id, status, expires_at, entity_type, entity_id, workspace_id")
      .eq("id", response.approvalId)
      .maybeSingle();

    if (loadErr || !row) {
      await notificationProvider.sendStatusUpdate({
        level: "warning",
        title: "Approval not found",
        body: response.approvalId,
      });
      return NextResponse.json({ ok: true });
    }

    if (String(row.workspace_id) !== String(workspaceId)) {
      opsLog("notification_webhook.workspace_mismatch", { approvalId: response.approvalId }, "warn");
      return NextResponse.json({ ok: true });
    }

    if (row.status !== "pending") {
      return NextResponse.json({ ok: true });
    }

    const expiresAt = row.expires_at ? new Date(row.expires_at as string).getTime() : 0;
    if (expiresAt && Date.now() > expiresAt) {
      await supabase
        .from("notification_approvals")
        .update({ status: "expired", responded_at: new Date().toISOString() })
        .eq("id", row.id);

      await notificationProvider.sendStatusUpdate({
        level: "warning",
        title: "Approval expired",
        body: "Open the dashboard to request a new draft.",
      });
      return NextResponse.json({ ok: true });
    }

    await supabase
      .from("notification_approvals")
      .update({
        status: response.decision === "approved" ? "approved" : "rejected",
        responded_at: response.respondedAt,
      })
      .eq("id", row.id);

    if (response.decision === "rejected") {
      await notificationProvider.sendStatusUpdate({
        level: "info",
        title: "Draft rejected",
        body: "Open dashboard to edit or regenerate.",
      });

      await supabase
        .from("ace_runs")
        .update({
          status: "failed",
          completed_at: new Date().toISOString(),
          summary: "Rejected in Telegram",
        })
        .eq("approval_id", row.id);

      return NextResponse.json({ ok: true });
    }

    if (row.entity_type === "newsletter_draft") {
      const draftId = row.entity_id as string;

      if (!isBeehiivEnabled()) {
        await notificationProvider.sendStatusUpdate({
          level: "error",
          title: "Publish failed",
          body: "Beehiiv is not enabled.",
        });
        await supabase
          .from("ace_runs")
          .update({
            status: "failed",
            completed_at: new Date().toISOString(),
            error: "Beehiiv not enabled",
          })
          .eq("approval_id", row.id);
        return NextResponse.json({ ok: true });
      }

      const { data: draft, error: draftErr } = await supabase
        .from("issue_drafts")
        .select("id, content_json")
        .eq("id", draftId)
        .eq("workspace_id", workspaceId)
        .maybeSingle();

      if (draftErr || !draft?.content_json) {
        await notificationProvider.sendStatusUpdate({
          level: "error",
          title: "Publish failed",
          body: draftErr?.message ?? "Draft not found",
        });
        await supabase
          .from("ace_runs")
          .update({
            status: "failed",
            completed_at: new Date().toISOString(),
            error: "Draft load failed",
          })
          .eq("approval_id", row.id);
        return NextResponse.json({ ok: true });
      }

      const contentJson = draft.content_json as DraftContentJson;
      const htmlContent = renderDraftHtml(contentJson);
      const title = contentJson.title || "Untitled Issue";
      const thesis = contentJson.metadata?.thesis;

      try {
        const result = await createBeehiivDraft({
          title,
          subtitle: thesis || undefined,
          htmlContent,
        });

        await notificationProvider.sendStatusUpdate({
          level: "success",
          title: "Published",
          body: result.title,
          url: result.web_url || undefined,
        });

        await supabase
          .from("ace_runs")
          .update({
            status: "completed",
            completed_at: new Date().toISOString(),
            summary: `Published to Beehiiv: ${result.title}`,
          })
          .eq("approval_id", row.id);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await notificationProvider.sendStatusUpdate({
          level: "error",
          title: "Publish failed",
          body: message,
        });
        await supabase
          .from("ace_runs")
          .update({
            status: "failed",
            completed_at: new Date().toISOString(),
            error: message,
          })
          .eq("approval_id", row.id);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    opsLog("notification_webhook.error", { message, provider: providerSlug }, "error");
    return NextResponse.json({ ok: true });
  }
}
