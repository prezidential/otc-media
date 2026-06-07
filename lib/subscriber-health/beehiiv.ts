// lib/subscriber-health/beehiiv.ts
//
// Beehiiv data access + extraction for the Subscriber Health pipeline. Credentials
// are passed in (no env reads here) so callers can resolve them per-workspace.

import { num, toPercent } from "./kpi";
import {
  getMcpConfig,
  withMcp,
  type McpCall,
  type McpConfig,
} from "@/lib/integrations/mcp";

const BEEHIIV_API_BASE = "https://api.beehiiv.com/v2";
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export type BeehiivSubscription = {
  id?: string;
  created_at?: string | number;
  created?: number; // some Beehiiv payloads use unix seconds
  referral_code?: string | null;
  utm_source?: string | null;
};

export type PostRates = { openRate: number; clickRate: number };

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

export function averageRates(rates: PostRates[]): PostRates {
  if (rates.length === 0) return { openRate: 0, clickRate: 0 };
  const sum = rates.reduce(
    (acc, r) => ({ openRate: acc.openRate + r.openRate, clickRate: acc.clickRate + r.clickRate }),
    { openRate: 0, clickRate: 0 }
  );
  return { openRate: sum.openRate / rates.length, clickRate: sum.clickRate / rates.length };
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
// Normalized metric gathering (MCP-or-REST)
// ---------------------------------------------------------------------------

/** The seven raw values the health report evaluates, normalized across data sources. */
export type BeehiivMetrics = {
  weeklyNewSubs: number;
  linkedInSourcedPercent: number;
  boostSourcedPercent: number;
  monthlyChurnRate: number;
  openRate: number; // percent
  clickRate: number; // percent
  paidSubscribers: number;
};

/**
 * Gather metrics via the Beehiiv MCP server. Uses the richer server-side stats:
 * `get_publication_stats(last_7_days)` for new subs + acquisition sources, the last 3
 * published posts for open/click (preserving the REST metric definition), the 4-week
 * window for monthly churn, and a tier-filtered subscription count for paid subscribers.
 *
 * `call` is injected so the transformation is unit-testable without a live MCP server.
 */
export async function collectBeehiivViaMcp(pubId: string, call: McpCall): Promise<BeehiivMetrics> {
  const stats7 = asObject(
    await call("get_publication_stats", { publication_id: pubId, time_period: "last_7_days" })
  );
  const w7 = asObject(stats7.last_7_days);
  const weeklyNewSubs = num(w7.new_subscribers);

  const sources = Array.isArray(w7.acquisition_sources)
    ? (w7.acquisition_sources as Array<Record<string, unknown>>)
    : [];
  let linkedInSourced = 0;
  let boostSourced = 0;
  for (const s of sources) {
    const src = String(s.source ?? "").toLowerCase();
    const count = num(s.count);
    if (src.includes("linkedin")) linkedInSourced += count;
    if (src.includes("boost")) boostSourced += count;
  }
  const linkedInSourcedPercent = weeklyNewSubs > 0 ? (linkedInSourced / weeklyNewSubs) * 100 : 0;
  const boostSourcedPercent = weeklyNewSubs > 0 ? (boostSourced / weeklyNewSubs) * 100 : 0;

  // Open/click: average the last 3 published posts (same definition as REST mode).
  const postsRes = asObject(
    await call("list_posts", {
      publication_id: pubId,
      status: "published",
      per_page: 3,
      order_by: "newest_first",
    })
  );
  const posts = Array.isArray(postsRes.posts)
    ? (postsRes.posts as Array<Record<string, unknown>>)
    : [];
  const postIds = posts
    .map((p) => p.id)
    .filter((id): id is string => typeof id === "string")
    .slice(0, 3);
  const rates: PostRates[] = [];
  for (const id of postIds) {
    const ps = asObject(await call("get_post_stats", { post_id: id }));
    const email = asObject(ps.email);
    // MCP returns rates already as percentages.
    rates.push({ openRate: num(email.open_rate), clickRate: num(email.click_rate) });
  }
  const { openRate, clickRate } = averageRates(rates);

  // Monthly churn from the 4-week window.
  const stats4 = asObject(
    await call("get_publication_stats", { publication_id: pubId, time_period: "last_4_weeks" })
  );
  const active = num(stats4.current_active_subscribers);
  const churned = num(asObject(stats4.last_4_weeks).churned_subscribers);
  const monthlyChurnRate = active > 0 ? (churned / active) * 100 : 0;

  // Paid subscribers via server-side tier filter (pagination.total is the full count).
  const paidRes = asObject(
    await call("list_subscriptions", {
      publication_id: pubId,
      status: "active",
      tier: "paid",
      per_page: 1,
    })
  );
  const paidSubscribers = num(asObject(paidRes.pagination).total);

  return {
    weeklyNewSubs,
    linkedInSourcedPercent,
    boostSourcedPercent,
    monthlyChurnRate,
    openRate,
    clickRate,
    paidSubscribers,
  };
}

export async function gatherBeehiivMetricsMcp(config: McpConfig, pubId: string): Promise<BeehiivMetrics> {
  return withMcp(config, (call) => collectBeehiivViaMcp(pubId, call));
}

/** Gather metrics via the Beehiiv REST API v2 (the default when no MCP server is set). */
export async function gatherBeehiivMetricsRest(apiKey: string, pubId: string): Promise<BeehiivMetrics> {
  const statsJson = await beehiivGet(`/publications/${pubId}/stats`, apiKey);
  const { paidSubscribers, monthlyChurnRate } = extractPublicationStats(statsJson);

  const postsJson = await beehiivGet<{ data?: Array<{ id?: string }> }>(
    `/publications/${pubId}/posts?status=confirmed&limit=3&order_by=publish_date&direction=desc`,
    apiKey
  );
  const postIds = (postsJson.data ?? [])
    .map((p) => p.id)
    .filter((id): id is string => typeof id === "string");
  const rates: PostRates[] = [];
  for (const id of postIds) {
    rates.push(extractPostRates(await beehiivGet(`/publications/${pubId}/posts/${id}/stats`, apiKey)));
  }
  const { openRate, clickRate } = averageRates(rates);

  const subsJson = await beehiivGet<{ data?: BeehiivSubscription[] }>(
    `/publications/${pubId}/subscriptions?status=active&order_by=created&direction=desc&limit=500`,
    apiKey
  );
  const sub = analyzeSubscriptions(subsJson.data ?? []);

  return {
    weeklyNewSubs: sub.weeklyNewSubs,
    linkedInSourcedPercent: sub.linkedInSourcedPercent,
    boostSourcedPercent: sub.boostSourcedPercent,
    monthlyChurnRate,
    openRate,
    clickRate,
    paidSubscribers,
  };
}

/** Choose MCP when `BEEHIIV_MCP_SERVER_URL` is configured, otherwise REST. */
export async function gatherBeehiivMetrics(
  apiKey: string | undefined,
  pubId: string,
  mcpOverride?: McpConfig
): Promise<BeehiivMetrics> {
  // Prefer a caller-supplied MCP config (e.g. an OAuth Bearer for the active
  // workspace); fall back to the env/static MCP config, then REST.
  const mcp = mcpOverride ?? getMcpConfig("beehiiv");
  if (mcp) return gatherBeehiivMetricsMcp(mcp, pubId);
  if (!apiKey) throw new Error("BEEHIIV_API_KEY is required for Beehiiv REST mode");
  return gatherBeehiivMetricsRest(apiKey, pubId);
}
