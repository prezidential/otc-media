// lib/subscriber-health/kpi.ts
//
// Pure KPI evaluation + formatting primitives for the Subscriber Health pipeline
// (Cornerstone OS Agent Execution Plan v1, Phase 1, §3.17). No I/O — safe to import
// anywhere (route, run module, UI status route, tests).

export type KpiStatus = "green" | "yellow" | "red";
export type KpiConfig = { target: number; warn: number };

export type MetricKey =
  | "weeklyNewSubs"
  | "linkedInSourcedPercent"
  | "boostSourcedPercent"
  | "monthlyChurnRate"
  | "openRate"
  | "clickRate"
  | "paidSubscribers";

export type KpiConfigMap = Record<MetricKey, KpiConfig>;

export type ReportMetric = {
  value: number;
  status: KpiStatus;
  consecutiveWeeksBelow: number;
};

// Metrics where a *lower* value is better.
export const INVERTED_METRICS = new Set<MetricKey>(["boostSourcedPercent", "monthlyChurnRate"]);

// Metrics rendered as percentages (the rest are raw counts).
export const PERCENT_METRICS = new Set<MetricKey>([
  "linkedInSourcedPercent",
  "boostSourcedPercent",
  "monthlyChurnRate",
  "openRate",
  "clickRate",
]);

export const METRIC_LABELS: Record<MetricKey, string> = {
  weeklyNewSubs: "New subs",
  linkedInSourcedPercent: "LinkedIn sourced",
  boostSourcedPercent: "Boost sourced",
  monthlyChurnRate: "Monthly churn",
  openRate: "Open rate",
  clickRate: "Click rate",
  paidSubscribers: "Paid subscribers",
};

// Stable order, grouped Growth → Retention → Monetization (matches the report layout).
export const METRIC_ORDER: MetricKey[] = [
  "weeklyNewSubs",
  "linkedInSourcedPercent",
  "boostSourcedPercent",
  "monthlyChurnRate",
  "openRate",
  "clickRate",
  "paidSubscribers",
];

export const STATUS_EMOJI: Record<KpiStatus, string> = {
  green: "✅",
  yellow: "🟡",
  red: "🔴",
};

// ---------------------------------------------------------------------------
// Numeric helpers
// ---------------------------------------------------------------------------

export function num(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** Beehiiv reports rates as fractions (0.65) in some payloads and percentages (65) in
 *  others. Normalize anything <= 1 to a percentage. */
export function toPercent(value: number): number {
  return value <= 1 ? value * 100 : value;
}

export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

// ---------------------------------------------------------------------------
// KPI evaluation
// ---------------------------------------------------------------------------

// Standard (higher is better):
export function evalStandard(value: number, cfg: KpiConfig): KpiStatus {
  if (value >= cfg.target) return "green";
  if (value >= cfg.warn) return "yellow";
  return "red";
}

// Inverted (lower is better — used for boostSourcedPercent and monthlyChurnRate):
export function evalInverted(value: number, cfg: KpiConfig): KpiStatus {
  if (value <= cfg.target) return "green";
  if (value <= cfg.warn) return "yellow";
  return "red";
}

export function evaluateMetric(key: MetricKey, value: number, cfg: KpiConfig): KpiStatus {
  return INVERTED_METRICS.has(key) ? evalInverted(value, cfg) : evalStandard(value, cfg);
}

// ---------------------------------------------------------------------------
// ISO week number (week 1 contains the first Thursday of the year)
// ---------------------------------------------------------------------------

export function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7; // Sunday => 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}
