// lib/integrations/beehiiv/normalize.ts
//
// Normalizes Beehiiv data from BOTH sources (MCP server and REST API v2) into one
// stable shape per tool, so the Analytics UI and agent are source-agnostic.
//
// Rate-unit caveat (mirrors lib/subscriber-health/beehiiv.ts): the Beehiiv MCP server
// returns open/click rates already as PERCENT (e.g. 64.35), while the REST API returns
// them as FRACTIONS (0–1). Normalizers reconcile this so the UI always gets percent.

export type BeehiivPublicationStats = {
  activeSubscribers: number;
  newSubscribers: number;
  churnedSubscribers: number;
  netSubscribers: number;
  openRate: number; // percent
  clickRate: number; // percent
  earnings: number; // USD
  acquisitionSources: { source: string; count: number }[];
  period: string;
};

export type BeehiivPostSummary = {
  id: string;
  title: string;
  status: string;
  openRate: number; // percent
  clickRate: number; // percent
  publishedAt: string | null;
};

export type PostRates = { openRate: number; clickRate: number };

function asObj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

/** Safe numeric coercion that also strips currency/formatting (e.g. "$15.61" -> 15.61). */
export function num(v: unknown, d = 0): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : d;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(/[^0-9.\-]/g, ""));
    return Number.isFinite(n) ? n : d;
  }
  return d;
}

function mapSources(v: unknown): { source: string; count: number }[] {
  if (!Array.isArray(v)) return [];
  return v.map((s) => {
    const o = asObj(s);
    return { source: String(o.source ?? ""), count: num(o.count) };
  });
}

/**
 * MCP `get_publication_stats(publication_id, time_period)` returns top-level
 * `current_active_subscribers` plus a nested object keyed by the requested period
 * (e.g. `last_4_weeks: { open_rate, click_rate, new_subscribers, ... }`).
 */
export function normalizePublicationStatsMcp(
  json: unknown,
  periodKey: string
): BeehiivPublicationStats {
  const o = asObj(json);
  const p = asObj(o[periodKey]);
  return {
    activeSubscribers: num(o.current_active_subscribers ?? o.active_subscribers),
    newSubscribers: num(p.new_subscribers),
    churnedSubscribers: num(p.churned_subscribers),
    netSubscribers: num(p.net_subscribers),
    openRate: num(p.open_rate), // already percent
    clickRate: num(p.click_rate), // already percent
    earnings: num(p.earnings),
    acquisitionSources: mapSources(p.acquisition_sources),
    period: periodKey,
  };
}

/** REST `/publications/{id}/stats` returns `{ data: { total_active_subscriptions, average_open_rate(0–1), ... } }`. */
export function normalizePublicationStatsRest(json: unknown): BeehiivPublicationStats {
  const d = asObj(asObj(json).data);
  return {
    activeSubscribers: num(d.total_active_subscriptions ?? d.active_subscriptions),
    newSubscribers: num(d.new_subscribers_30d ?? d.net_new_subscribers_30d),
    churnedSubscribers: 0,
    netSubscribers: num(d.net_new_subscribers_30d),
    openRate: num(d.average_open_rate) * 100, // fraction -> percent
    clickRate: num(d.average_click_rate) * 100,
    earnings: num(d.total_revenue ?? d.earnings),
    acquisitionSources: [],
    period: "all_time",
  };
}

/** Extract open/click from an MCP `get_post_stats` response (rates already percent). */
export function extractPostRatesMcp(json: unknown): PostRates {
  const d = asObj(json);
  const email = asObj(d.email ?? asObj(d.stats).email);
  return {
    openRate: num(email.open_rate ?? d.open_rate),
    clickRate: num(email.click_rate ?? d.click_rate),
  };
}

/** Extract open/click from a REST post-stats payload (rates as fractions). */
export function extractPostRatesRest(json: unknown): PostRates {
  const d = asObj(asObj(json).data);
  const stats = asObj(d.stats);
  const email = asObj(stats.email);
  return {
    openRate: num(email.open_rate ?? stats.open_rate ?? d.open_rate) * 100,
    clickRate: num(email.click_rate ?? stats.click_rate ?? d.click_rate) * 100,
  };
}

/** Map an MCP `list_posts` response (+ per-post rates) into BeehiivPostSummary[]. */
export function normalizePostsMcp(
  posts: unknown,
  ratesById: Record<string, PostRates>
): BeehiivPostSummary[] {
  const arr = Array.isArray(posts) ? posts : [];
  return arr.map((p) => {
    const o = asObj(p);
    const id = String(o.id ?? "");
    const rates = ratesById[id] ?? { openRate: 0, clickRate: 0 };
    return {
      id,
      title: String(o.title ?? o.subject ?? "Untitled"),
      status: String(o.status ?? ""),
      openRate: rates.openRate,
      clickRate: rates.clickRate,
      publishedAt:
        typeof o.scheduled_at === "string"
          ? o.scheduled_at
          : typeof o.created_at === "string"
            ? o.created_at
            : null,
    };
  });
}

/** Map a REST `list_posts` response (with `expand[]=stats`) into BeehiivPostSummary[]. */
export function normalizePostsRest(json: unknown): BeehiivPostSummary[] {
  const data = asObj(json).data;
  const arr = Array.isArray(data) ? data : [];
  return arr.map((p) => {
    const o = asObj(p);
    const stats = asObj(o.stats);
    const email = asObj(stats.email);
    return {
      id: String(o.id ?? ""),
      title: String(o.subject ?? o.title ?? "Untitled"),
      status: String(o.status ?? ""),
      openRate: num(email.open_rate ?? stats.open_rate) * 100,
      clickRate: num(email.click_rate ?? stats.click_rate) * 100,
      publishedAt:
        typeof o.publish_date === "number"
          ? new Date(o.publish_date * 1000).toISOString()
          : typeof o.publish_date === "string"
            ? o.publish_date
            : null,
    };
  });
}
