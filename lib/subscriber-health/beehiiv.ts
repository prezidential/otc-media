// lib/subscriber-health/beehiiv.ts
//
// Beehiiv data access + extraction for the Subscriber Health pipeline. Credentials
// are passed in (no env reads here) so callers can resolve them per-workspace.

import { num, toPercent } from "./kpi";

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
