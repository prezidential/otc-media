// lib/subscriber-health/report.ts
//
// Builds the plain-text Telegram message for a subscriber health report.

import {
  METRIC_LABELS,
  STATUS_EMOJI,
  round1,
  type KpiConfigMap,
  type MetricKey,
  type ReportMetric,
} from "./kpi";

export type ReportMetrics = Record<MetricKey, ReportMetric>;

function pushMetricLine(
  lines: string[],
  key: MetricKey,
  text: string,
  metric: ReportMetric
): void {
  lines.push(text);
  if (metric.consecutiveWeeksBelow >= 3) {
    lines.push(
      `(⚠️ ${METRIC_LABELS[key]} below warn threshold for ${metric.consecutiveWeeksBelow} consecutive weeks)`
    );
  }
}

export function formatReport(opts: {
  date: string;
  weekNumber: number;
  metrics: ReportMetrics;
  kpis: KpiConfigMap;
  cornerstoneUrl?: string;
}): string {
  const { date, weekNumber, metrics, kpis, cornerstoneUrl } = opts;
  const emoji = (key: MetricKey) => STATUS_EMOJI[metrics[key].status];

  const lines: string[] = [];
  lines.push("📊 Subscriber Health Report");
  lines.push(`${date} (Week ${weekNumber})`);
  lines.push("");

  lines.push("📈 Growth");
  pushMetricLine(
    lines,
    "weeklyNewSubs",
    `New subs (7d): ${Math.round(metrics.weeklyNewSubs.value)} ${emoji("weeklyNewSubs")} (target: ${kpis.weeklyNewSubs.target})`,
    metrics.weeklyNewSubs
  );
  pushMetricLine(
    lines,
    "linkedInSourcedPercent",
    `LinkedIn sourced: ${round1(metrics.linkedInSourcedPercent.value)}% ${emoji("linkedInSourcedPercent")} (target: ${kpis.linkedInSourcedPercent.target}%)`,
    metrics.linkedInSourcedPercent
  );
  pushMetricLine(
    lines,
    "boostSourcedPercent",
    `Boost sourced: ${round1(metrics.boostSourcedPercent.value)}% ${emoji("boostSourcedPercent")} (warn: ${kpis.boostSourcedPercent.warn}%)`,
    metrics.boostSourcedPercent
  );
  lines.push("");

  lines.push("💔 Retention");
  pushMetricLine(
    lines,
    "monthlyChurnRate",
    `Monthly churn: ${round1(metrics.monthlyChurnRate.value)}% ${emoji("monthlyChurnRate")} (target: <${kpis.monthlyChurnRate.target}%)`,
    metrics.monthlyChurnRate
  );
  pushMetricLine(
    lines,
    "openRate",
    `Open rate (last 3): ${round1(metrics.openRate.value)}% ${emoji("openRate")} (target: ${kpis.openRate.target}%)`,
    metrics.openRate
  );
  pushMetricLine(
    lines,
    "clickRate",
    `Click rate (last 3): ${round1(metrics.clickRate.value)}% ${emoji("clickRate")} (target: ${kpis.clickRate.target}%)`,
    metrics.clickRate
  );
  lines.push("");

  lines.push("💰 Monetization");
  pushMetricLine(
    lines,
    "paidSubscribers",
    `Paid subscribers: ${Math.round(metrics.paidSubscribers.value)} ${emoji("paidSubscribers")} (target: ${kpis.paidSubscribers.target})`,
    metrics.paidSubscribers
  );

  const anyRed = (Object.keys(metrics) as MetricKey[]).some((k) => metrics[k].status === "red");
  if (anyRed && cornerstoneUrl) {
    lines.push("");
    lines.push(`📌 Dashboard: ${cornerstoneUrl}/integrations/analytics`);
  }

  return lines.join("\n");
}
