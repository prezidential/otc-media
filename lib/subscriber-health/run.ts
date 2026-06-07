// lib/subscriber-health/run.ts
//
// Per-workspace orchestrator for the Subscriber Health pipeline. Resolves Beehiiv +
// notification config through a per-workspace seam (currently env-backed, exactly like
// ACE), pulls 7-day stats, evaluates KPIs, persists history, and sends the Telegram
// report. Invoked once per enabled workspace by the cron route.

import { supabaseAdmin } from "@/lib/supabase/server";
import { getNotificationProvider } from "@/lib/notifications/factory";
import { opsLog } from "@/lib/ops/log";
import defaultKpis from "@/config/subscriber-kpis.json";

import {
  evaluateMetric,
  getISOWeek,
  type KpiConfigMap,
  type MetricKey,
  type ReportMetric,
} from "./kpi";
import { gatherBeehiivMetrics } from "./beehiiv";
import { isMcpEnabled, type McpConfig } from "@/lib/integrations/mcp";
import { formatReport, type ReportMetrics } from "./report";
import {
  loadHistory,
  saveHistory,
  updateHistory,
  type MetricSnapshot,
} from "./history";

export type SubscriberHealthTrigger = "cron" | "manual" | "api";

export type SubscriberHealthResult = {
  workspaceId: string;
  status: "completed" | "skipped" | "failed";
  summary: string;
  error?: string;
};

export type BeehiivConfig = { apiKey?: string; publicationId: string };

/**
 * Resolve a workspace's Beehiiv config. Per-workspace seam: today it returns the global
 * env vars (matching how ACE/publishing resolve Beehiiv); when an encrypted
 * `workspace_integrations` store lands, swap the body to look up by `workspaceId`.
 *
 * Needs a publication ID plus a way to authenticate: either `BEEHIIV_API_KEY` (REST) or
 * a configured Beehiiv MCP server (`gatherBeehiivMetrics` routes through MCP when set).
 */
export function resolveBeehiivConfig(workspaceId: string): BeehiivConfig | null {
  void workspaceId;
  const apiKey = process.env.BEEHIIV_API_KEY;
  const publicationId = process.env.BEEHIIV_PUBLICATION_ID;
  if (!publicationId) return null;
  if (!apiKey && !isMcpEnabled("beehiiv")) return null;
  return { apiKey, publicationId };
}

const KPIS = defaultKpis as KpiConfigMap;

export async function runSubscriberHealth(options: {
  workspaceId: string;
  trigger: SubscriberHealthTrigger;
  /** Optional OAuth-resolved Beehiiv MCP config (overrides the env/static path). */
  beehiivMcp?: McpConfig;
}): Promise<SubscriberHealthResult> {
  const { workspaceId, trigger, beehiivMcp } = options;
  const supabase = supabaseAdmin();

  const beehiiv = resolveBeehiivConfig(workspaceId);
  if (!beehiiv) {
    return {
      workspaceId,
      status: "skipped",
      summary: "Beehiiv not configured for workspace",
    };
  }

  try {
    // Gathers via the Beehiiv MCP server when BEEHIIV_MCP_SERVER_URL is set, else REST.
    const m = await gatherBeehiivMetrics(beehiiv.apiKey, beehiiv.publicationId, beehiivMcp);

    const values: Record<MetricKey, number> = {
      weeklyNewSubs: m.weeklyNewSubs,
      linkedInSourcedPercent: m.linkedInSourcedPercent,
      boostSourcedPercent: m.boostSourcedPercent,
      monthlyChurnRate: m.monthlyChurnRate,
      openRate: m.openRate,
      clickRate: m.clickRate,
      paidSubscribers: m.paidSubscribers,
    };

    const now = new Date();
    const weekNumber = getISOWeek(now);

    // Evaluate, update streaks, build report metrics + snapshots to persist.
    const history = await loadHistory(workspaceId, supabase);
    const metrics = {} as ReportMetrics;
    const snapshots: Partial<Record<MetricKey, MetricSnapshot>> = {};
    for (const key of Object.keys(values) as MetricKey[]) {
      const status = evaluateMetric(key, values[key], KPIS[key]);
      const entry = updateHistory(history, key, status);
      const metric: ReportMetric = {
        value: values[key],
        status,
        consecutiveWeeksBelow: entry.consecutiveWeeksBelow,
      };
      metrics[key] = metric;
      snapshots[key] = { ...metric, week: weekNumber };
    }
    await saveHistory(workspaceId, snapshots, supabase);

    const message = formatReport({
      date: now.toISOString().slice(0, 10),
      weekNumber,
      metrics,
      kpis: KPIS,
      cornerstoneUrl: process.env.CORNERSTONE_URL || undefined,
    });

    await getNotificationProvider().sendMessage(message);

    const redCount = (Object.keys(metrics) as MetricKey[]).filter(
      (k) => metrics[k].status === "red"
    ).length;
    const summary = `Week ${weekNumber}: ${redCount} red / ${Object.keys(metrics).length} metrics`;

    await recordRun(supabase, workspaceId, trigger, "completed", summary);
    return { workspaceId, status: "completed", summary };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    opsLog("subscriber_health.run_failed", { workspaceId, error: message }, "error");
    await recordRun(supabase, workspaceId, trigger, "failed", message);
    try {
      await getNotificationProvider().sendStatusUpdate({
        level: "error",
        title: "Subscriber health report failed",
        body: message,
      });
    } catch {
      /* notification misconfigured — already logged */
    }
    return { workspaceId, status: "failed", summary: message, error: message };
  }
}

async function recordRun(
  supabase: ReturnType<typeof supabaseAdmin>,
  workspaceId: string,
  trigger: SubscriberHealthTrigger,
  status: "completed" | "failed",
  summary: string
): Promise<void> {
  await supabase.from("runs").insert({
    workspace_id: workspaceId,
    run_type: "pipeline:subscriber-health",
    status: status === "completed" ? "completed" : "failed",
    input_refs_json: { triggered_by: trigger },
    output_refs_json: { summary },
    finished_at: new Date().toISOString(),
  });
}
