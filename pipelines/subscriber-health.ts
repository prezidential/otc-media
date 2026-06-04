// pipelines/subscriber-health.ts
//
// Weekly subscriber health report (Cornerstone OS Agent Execution Plan v1, Phase 1, §3.17).
//
// Standalone Node script — NOT part of the Next.js app. It pulls 7-day subscriber
// stats from Beehiiv, evaluates them against configurable KPI targets, and sends a
// structured Telegram message with ✅/🟡/🔴 status per metric.
//
// Usage: npx tsx pipelines/subscriber-health.ts
// Or after build: node pipelines/subscriber-health.js
//
// Shares env vars with the app (BEEHIIV_API_KEY, BEEHIIV_PUBLICATION_ID,
// TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID) but has no import dependency on the app.

import * as fs from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";

// ---------------------------------------------------------------------------
// Constants & paths
// ---------------------------------------------------------------------------

const BEEHIIV_API_BASE = "https://api.beehiiv.com/v2";
const TELEGRAM_API_BASE = "https://api.telegram.org";

const KPI_CONFIG_PATH = path.join(process.cwd(), "config", "subscriber-kpis.json");
const KPI_HISTORY_PATH = path.join(process.cwd(), "data", "kpi-history.json");

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

export type KpiHistory = {
  [metric: string]: {
    consecutiveWeeksBelow: number;
    lastStatus: KpiStatus;
  };
};

export type ReportMetric = {
  value: number;
  status: KpiStatus;
  consecutiveWeeksBelow: number;
};

export type BeehiivSubscription = {
  id?: string;
  created_at?: string | number;
  created?: number; // some Beehiiv payloads use unix seconds
  referral_code?: string | null;
  utm_source?: string | null;
};

export type PostRates = { openRate: number; clickRate: number };

// Metrics where a *lower* value is better.
const INVERTED_METRICS = new Set<MetricKey>(["boostSourcedPercent", "monthlyChurnRate"]);

const METRIC_LABELS: Record<MetricKey, string> = {
  weeklyNewSubs: "New subs",
  linkedInSourcedPercent: "LinkedIn sourced",
  boostSourcedPercent: "Boost sourced",
  monthlyChurnRate: "Monthly churn",
  openRate: "Open rate",
  clickRate: "Click rate",
  paidSubscribers: "Paid subscribers",
};

const STATUS_EMOJI: Record<KpiStatus, string> = {
  green: "✅",
  yellow: "🟡",
  red: "🔴",
};

const REQUIRED_ENV = [
  "BEEHIIV_API_KEY",
  "BEEHIIV_PUBLICATION_ID",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_CHAT_ID",
] as const;

// ---------------------------------------------------------------------------
// Small numeric helpers
// ---------------------------------------------------------------------------

function num(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** Beehiiv reports rates as fractions (0.65) in some payloads and percentages (65) in
 *  others. Normalize anything <= 1 to a percentage. */
function toPercent(value: number): number {
  return value <= 1 ? value * 100 : value;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

export function assertEnv(env: Record<string, string | undefined> = process.env): void {
  const missing = REQUIRED_ENV.filter((key) => !env[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(", ")}. ` +
        `subscriber-health requires ${REQUIRED_ENV.join(", ")}.`
    );
  }
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

// ---------------------------------------------------------------------------
// Subscription analysis
// ---------------------------------------------------------------------------

function subscriptionCreatedMs(sub: BeehiivSubscription): number {
  if (sub.created_at !== undefined && sub.created_at !== null) {
    const ms = typeof sub.created_at === "number" ? sub.created_at : Date.parse(sub.created_at);
    if (Number.isFinite(ms)) return ms;
  }
  if (typeof sub.created === "number" && Number.isFinite(sub.created)) {
    return sub.created * 1000; // unix seconds → ms
  }
  return NaN;
}

export type SubscriptionAnalysis = {
  weeklyNewSubs: number;
  linkedInSourced: number;
  boostSourced: number;
  linkedInSourcedPercent: number;
  boostSourcedPercent: number;
};

export function analyzeSubscriptions(
  subs: BeehiivSubscription[],
  nowMs: number = Date.now()
): SubscriptionAnalysis {
  const cutoff = nowMs - SEVEN_DAYS_MS;
  const recent = subs.filter((s) => {
    const created = subscriptionCreatedMs(s);
    return Number.isFinite(created) && created >= cutoff;
  });

  const weeklyNewSubs = recent.length;
  const linkedInSourced = recent.filter((s) =>
    (s.referral_code ?? "").startsWith("LI_")
  ).length;
  const boostSourced = recent.filter((s) => {
    const code = (s.referral_code ?? "").toLowerCase();
    const utm = (s.utm_source ?? "").toLowerCase();
    return code.includes("boost") || utm.includes("boost");
  }).length;

  // Guard against division by zero when there are no new subs this week.
  const linkedInSourcedPercent = weeklyNewSubs > 0 ? (linkedInSourced / weeklyNewSubs) * 100 : 0;
  const boostSourcedPercent = weeklyNewSubs > 0 ? (boostSourced / weeklyNewSubs) * 100 : 0;

  return { weeklyNewSubs, linkedInSourced, boostSourced, linkedInSourcedPercent, boostSourcedPercent };
}

// ---------------------------------------------------------------------------
// KPI history persistence
// ---------------------------------------------------------------------------

export function loadHistory(filePath: string = KPI_HISTORY_PATH): KpiHistory {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as KpiHistory;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    // Missing or malformed file → start fresh.
    return {};
  }
}

export function saveHistory(history: KpiHistory, filePath: string = KPI_HISTORY_PATH): void {
  fs.writeFileSync(filePath, `${JSON.stringify(history, null, 2)}\n`, "utf8");
}

export function updateHistory(
  history: KpiHistory,
  metric: string,
  status: KpiStatus
): KpiHistory[string] {
  const prev = history[metric] ?? { consecutiveWeeksBelow: 0, lastStatus: status };
  const consecutiveWeeksBelow = status === "red" ? prev.consecutiveWeeksBelow + 1 : 0;
  history[metric] = { consecutiveWeeksBelow, lastStatus: status };
  return history[metric];
}

// ---------------------------------------------------------------------------
// Telegram message formatting
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Beehiiv API
// ---------------------------------------------------------------------------

export async function beehiivGet<T = unknown>(endpoint: string, apiKey: string): Promise<T> {
  const res = await fetch(`${BEEHIIV_API_BASE}${endpoint}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    throw new Error(`Beehiiv API ${endpoint} failed: HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

type Json = Record<string, unknown>;

function asObject(value: unknown): Json {
  return value && typeof value === "object" ? (value as Json) : {};
}

export function extractPublicationStats(json: unknown): {
  totalActive: number;
  paidSubscribers: number;
  monthlyChurnRate: number;
} {
  const d = asObject(asObject(json).data);
  const totalActive = num(d.total_active_subscriptions ?? d.active_subscriptions);
  const paidSubscribers = num(d.paid_subscriptions ?? d.active_premium_subscriptions);

  let monthlyChurnRate: number;
  if (d.churn_rate !== undefined && d.churn_rate !== null) {
    monthlyChurnRate = toPercent(num(d.churn_rate));
  } else {
    // Approximate from 30-day net new: only meaningful when net change is negative.
    const netNew30 = num(d.net_new_subscribers_30d, 0);
    monthlyChurnRate =
      netNew30 < 0 && totalActive > 0 ? (Math.abs(netNew30) / totalActive) * 100 : 0;
  }

  return { totalActive, paidSubscribers, monthlyChurnRate };
}

export function extractPostRates(json: unknown): PostRates {
  const d = asObject(asObject(json).data);
  const stats = asObject(d.stats);
  const email = asObject(stats.email);
  const open = num(email.open_rate ?? stats.open_rate ?? d.open_rate);
  const click = num(email.click_rate ?? stats.click_rate ?? d.click_rate);
  return { openRate: toPercent(open), clickRate: toPercent(click) };
}

function averageRates(rates: PostRates[]): PostRates {
  if (rates.length === 0) return { openRate: 0, clickRate: 0 };
  const sum = rates.reduce(
    (acc, r) => ({ openRate: acc.openRate + r.openRate, clickRate: acc.clickRate + r.clickRate }),
    { openRate: 0, clickRate: 0 }
  );
  return { openRate: sum.openRate / rates.length, clickRate: sum.clickRate / rates.length };
}

// ---------------------------------------------------------------------------
// Telegram send
// ---------------------------------------------------------------------------

async function sendTelegram(message: string, botToken: string, chatId: string): Promise<void> {
  const res = await fetch(`${TELEGRAM_API_BASE}/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: message }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { description?: string };
    throw new Error(body.description || `Telegram sendMessage failed: HTTP ${res.status}`);
  }
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

export async function main(): Promise<void> {
  assertEnv();

  const apiKey = process.env.BEEHIIV_API_KEY!;
  const pubId = process.env.BEEHIIV_PUBLICATION_ID!;
  const botToken = process.env.TELEGRAM_BOT_TOKEN!;
  const chatId = process.env.TELEGRAM_CHAT_ID!;
  const cornerstoneUrl = process.env.CORNERSTONE_URL || undefined;

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

  // Assemble raw metric values.
  const values: Record<MetricKey, number> = {
    weeklyNewSubs: subAnalysis.weeklyNewSubs,
    linkedInSourcedPercent: subAnalysis.linkedInSourcedPercent,
    boostSourcedPercent: subAnalysis.boostSourcedPercent,
    monthlyChurnRate,
    openRate,
    clickRate,
    paidSubscribers,
  };

  // Load config + history.
  const kpis = JSON.parse(fs.readFileSync(KPI_CONFIG_PATH, "utf8")) as KpiConfigMap;
  const history = loadHistory();

  // Evaluate each metric and update history.
  const metrics = {} as ReportMetrics;
  for (const key of Object.keys(values) as MetricKey[]) {
    const status = evaluateMetric(key, values[key], kpis[key]);
    const entry = updateHistory(history, key, status);
    metrics[key] = { value: values[key], status, consecutiveWeeksBelow: entry.consecutiveWeeksBelow };
  }
  saveHistory(history);

  // Format + send.
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const message = formatReport({
    date,
    weekNumber: getISOWeek(now),
    metrics,
    kpis,
    cornerstoneUrl,
  });

  await sendTelegram(message, botToken, chatId);
  console.log(message);
  console.log("\n✅ Subscriber health report sent.");
}

// Only run when executed directly (not when imported by tests).
const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === invokedPath) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
