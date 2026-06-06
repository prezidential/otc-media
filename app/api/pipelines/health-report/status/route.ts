import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/auth/session";
import defaultKpis from "@/config/subscriber-kpis.json";
import {
  INVERTED_METRICS,
  METRIC_LABELS,
  METRIC_ORDER,
  PERCENT_METRICS,
  type KpiConfigMap,
  type KpiStatus,
  type MetricKey,
} from "@/lib/subscriber-health/kpi";

/**
 * GET /api/pipelines/health-report/status
 *
 * Per-workspace KPI health snapshot for the Subscriber Health panel on the analytics page.
 * Reads the latest persisted row per metric and merges it with the global KPI targets.
 * Returns `{ metrics: [] }` when the pipeline has never run for the workspace.
 */
const KPIS = defaultKpis as KpiConfigMap;

type HistoryRow = {
  metric: string;
  last_value: number | null;
  last_week: number | null;
  consecutive_weeks_below: number | null;
  last_status: KpiStatus;
  updated_at: string;
};

export async function GET(): Promise<Response> {
  const ctx = await requireWorkspace();
  if (ctx instanceof Response) return ctx;
  const { supabase, workspaceId } = ctx;

  const { data, error } = await supabase
    .from("subscriber_health_history")
    .select("metric, last_value, last_week, consecutive_weeks_below, last_status, updated_at")
    .eq("workspace_id", workspaceId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const byMetric = new Map<string, HistoryRow>();
  for (const row of (data ?? []) as HistoryRow[]) byMetric.set(row.metric, row);

  const metrics = METRIC_ORDER.filter((key) => byMetric.has(key)).map((key: MetricKey) => {
    const row = byMetric.get(key)!;
    const cfg = KPIS[key];
    return {
      key,
      label: METRIC_LABELS[key],
      value: row.last_value,
      status: row.last_status,
      target: cfg.target,
      warn: cfg.warn,
      kind: INVERTED_METRICS.has(key) ? "inverted" : "standard",
      unit: PERCENT_METRICS.has(key) ? "percent" : "count",
      consecutiveWeeksBelow: row.consecutive_weeks_below ?? 0,
      week: row.last_week,
      updatedAt: row.updated_at,
    };
  });

  return NextResponse.json({ metrics });
}
