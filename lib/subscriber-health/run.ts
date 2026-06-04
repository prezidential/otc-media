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
import {
  analyzeSubscriptions,
  averageRates,
  beehiivGet,
  extractPostRates,
  extractPublicationStats,
  type BeehiivSubscription,
  type PostRates,
} from "./beehiiv";
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

export type BeehiivConfig = { apiKey: string; publicationId: string };

/**
 * Resolve a workspace's Beehiiv credentials. Per-workspace seam: today it returns the
 * global env vars (matching how ACE/publishing resolve Beehiiv); when an encrypted
 * `workspace_integrations` store lands, swap the body to look up by `workspaceId`.
 */
export function resolveBeehiivConfig(workspaceId: string): BeehiivConfig | null {
  void workspaceId;
  const apiKey = process.env.BEEHIIV_API_KEY;
  const publicationId = process.env.BEEHIIV_PUBLICATION_ID;
  if (!apiKey || !publicationId) return null;
  return { apiKey, publicationId };
}

const KPIS = defaultKpis as KpiConfigMap;

export async function runSubscriberHealth(options: {
  workspaceId: string;
  trigger: SubscriberHealthTrigger;
}): Promise<SubscriberHealthResult> {
  const { workspaceId, trigger } = options;
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
    const { apiKey, publicationId: pubId } = beehiiv;

    // 1. Publication stats.
    const statsJson = await beehiivGet(`/publications/${pubId}/stats`, apiKey);
    const { paidSubscribers, monthlyChurnRate } = extractPublicationStats(statsJson);

    // 2. Last 3 published posts.
    const postsJson = await beehiivGet<{ data?: Array<{ id?: string }> }>(
      `/publications/${pubId}/posts?status=confirmed&limit=3&order_by=publish_date&direction=desc`,
      apiKey
    );
    const postIds = (postsJson.data ?? [])
      .map((p) => p.id)
      .filter((id): id is string => typeof id === "string");

    // 3. Per-post open/click rates.
    const postRates: PostRates[] = [];
    for (const postId of postIds) {
      const postStatsJson = await beehiivGet(`/publications/${pubId}/posts/${postId}/stats`, apiKey);
      postRates.push(extractPostRates(postStatsJson));
    }
    const { openRate, clickRate } = averageRates(postRates);

    // 4. Active subscriptions (filter to last 7 days client-side).
    const subsJson = await beehiivGet<{ data?: BeehiivSubscription[] }>(
      `/publications/${pubId}/subscriptions?status=active&order_by=created&direction=desc&limit=500`,
      apiKey
    );
    const subAnalysis = analyzeSubscriptions(subsJson.data ?? []);

    const values: Record<MetricKey, number> = {
      weeklyNewSubs: subAnalysis.weeklyNewSubs,
      linkedInSourcedPercent: subAnalysis.linkedInSourcedPercent,
      boostSourcedPercent: subAnalysis.boostSourcedPercent,
      monthlyChurnRate,
      openRate,
      clickRate,
      paidSubscribers,
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
