// lib/subscriber-health/history.ts
//
// Supabase-backed persistence for per-metric consecutive-week failure tracking and
// the latest snapshot rendered by the UI. Replaces the old file-based state — the
// app's filesystem is ephemeral, so this lives in `subscriber_health_history`.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { KpiStatus, MetricKey } from "./kpi";

const TABLE = "subscriber_health_history";

export type KpiHistoryEntry = {
  consecutiveWeeksBelow: number;
  lastStatus: KpiStatus;
};

export type KpiHistory = Partial<Record<MetricKey, KpiHistoryEntry>>;

/** A full per-metric snapshot persisted after a run. */
export type MetricSnapshot = {
  value: number;
  status: KpiStatus;
  consecutiveWeeksBelow: number;
  week: number;
};

type HistoryRow = {
  metric: string;
  consecutive_weeks_below: number | null;
  last_status: KpiStatus;
};

/** Load the streak/status counters for a workspace. Missing rows → empty object. */
export async function loadHistory(
  workspaceId: string,
  supabase: SupabaseClient
): Promise<KpiHistory> {
  const { data, error } = await supabase
    .from(TABLE)
    .select("metric, consecutive_weeks_below, last_status")
    .eq("workspace_id", workspaceId);

  if (error || !data) return {};

  const history: KpiHistory = {};
  for (const row of data as HistoryRow[]) {
    history[row.metric as MetricKey] = {
      consecutiveWeeksBelow: row.consecutive_weeks_below ?? 0,
      lastStatus: row.last_status,
    };
  }
  return history;
}

/**
 * Pure counter update: increment `consecutiveWeeksBelow` when the metric is red,
 * reset to 0 otherwise. Mutates and returns the entry for the metric; other metrics
 * are untouched.
 */
export function updateHistory(
  history: KpiHistory,
  metric: MetricKey,
  status: KpiStatus
): KpiHistoryEntry {
  const prev = history[metric] ?? { consecutiveWeeksBelow: 0, lastStatus: status };
  const consecutiveWeeksBelow = status === "red" ? prev.consecutiveWeeksBelow + 1 : 0;
  const entry: KpiHistoryEntry = { consecutiveWeeksBelow, lastStatus: status };
  history[metric] = entry;
  return entry;
}

/** Upsert one row per metric with the latest value, status, week, and streak. */
export async function saveHistory(
  workspaceId: string,
  snapshots: Partial<Record<MetricKey, MetricSnapshot>>,
  supabase: SupabaseClient
): Promise<void> {
  const now = new Date().toISOString();
  const rows = (Object.keys(snapshots) as MetricKey[]).map((metric) => {
    const snap = snapshots[metric]!;
    return {
      workspace_id: workspaceId,
      metric,
      last_value: snap.value,
      last_week: snap.week,
      consecutive_weeks_below: snap.consecutiveWeeksBelow,
      last_status: snap.status,
      updated_at: now,
    };
  });
  if (rows.length === 0) return;
  await supabase.from(TABLE).upsert(rows, { onConflict: "workspace_id,metric" });
}
