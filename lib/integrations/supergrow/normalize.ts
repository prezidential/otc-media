// lib/integrations/supergrow/normalize.ts
//
// Normalizes Supergrow MCP responses into stable shapes. The plugin's
// get_linkedin_analytics overview is COMPOSED from several MCP calls
// (get_followers + get_metrics per type), so the normalizers here turn each raw
// response into pieces that composeAnalytics() assembles.

export type SupergrowFollowerPoint = { date: string; count: number; change: number };
export type SupergrowImpressionPoint = { date: string; value: number };

export type SupergrowAnalytics = {
  workspaceId: string;
  period: string;
  profile: { name: string | null; profileUrl: string | null; accountId: string | null };
  followers: {
    current: number;
    totalChange: number;
    totalChangePercent: number;
    averageDailyChange: number;
    trend: SupergrowFollowerPoint[];
  };
  impressions: {
    total: number;
    averageDaily: number;
    peakDay: string | null;
    trendDirection: string;
    periodChange: number;
    series: SupergrowImpressionPoint[];
  };
  engagement: {
    reactions: number;
    comments: number;
    reshares: number;
    rate: number; // percent: (reactions+comments+reshares)/impressions*100
  };
};

export type SupergrowPostSummary = {
  id: string;
  content: string;
  impressions: number;
  reactions: number;
  comments: number;
  reshares: number;
  status: string;
  postedAt: string | null;
  url: string | null;
};

function asObj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

export function num(v: unknown, d = 0): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : d;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(/[^0-9.\-]/g, ""));
    return Number.isFinite(n) ? n : d;
  }
  return d;
}

/** Map the period vocabulary the plugin/UI uses (7d/30d/90d) to Supergrow's enum. */
export function toSupergrowPeriod(period: unknown): "last_7_days" | "last_30_days" {
  return period === "7d" || period === "last_7_days" ? "last_7_days" : "last_30_days";
}

export function normalizeFollowers(json: unknown): {
  followers: SupergrowAnalytics["followers"];
  profile: SupergrowAnalytics["profile"];
} {
  const o = asObj(json);
  const trend = asObj(o.trend);
  const summary = asObj(trend.summary);
  const meta = asObj(trend.meta);
  const data = Array.isArray(trend.data) ? trend.data : [];
  return {
    followers: {
      current: num(o.current_count),
      totalChange: num(summary.total_change),
      totalChangePercent: num(summary.total_change_percentage),
      averageDailyChange: num(summary.average_daily_change),
      trend: data.map((d) => {
        const p = asObj(d);
        return { date: String(p.date ?? ""), count: num(p.follower_count), change: num(p.change) };
      }),
    },
    profile: {
      name: typeof meta.name === "string" ? meta.name : null,
      profileUrl: typeof meta.profile_url === "string" ? meta.profile_url : null,
      accountId: typeof meta.account_id === "string" ? meta.account_id : null,
    },
  };
}

export function normalizeImpressions(json: unknown): SupergrowAnalytics["impressions"] {
  const o = asObj(json);
  const summary = asObj(o.summary);
  const peak = asObj(summary.peak_day);
  const data = Array.isArray(o.data) ? o.data : [];
  return {
    total: num(summary.total_count),
    averageDaily: num(summary.average_daily),
    peakDay: typeof peak.date === "string" ? peak.date : null,
    trendDirection: String(summary.trend_direction ?? ""),
    periodChange: num(summary.period_change),
    series: data.map((d) => {
      const p = asObj(d);
      return { date: String(p.date ?? ""), value: num(p.impression_count ?? p.count) };
    }),
  };
}

/** Pull the aggregate total from a get_metrics response (REACTION/COMMENT/RESHARE). */
export function metricTotal(json: unknown): number {
  return num(asObj(asObj(json).summary).total_count);
}

export function composeAnalytics(input: {
  workspaceId: string;
  period: string;
  followersJson: unknown;
  impressionsJson: unknown;
  reactions: number;
  comments: number;
  reshares: number;
  accountName?: string | null;
}): SupergrowAnalytics {
  const { followers, profile } = normalizeFollowers(input.followersJson);
  const impressions = normalizeImpressions(input.impressionsJson);
  const engaged = input.reactions + input.comments + input.reshares;
  const rate = impressions.total > 0 ? (engaged / impressions.total) * 100 : 0;
  return {
    workspaceId: input.workspaceId,
    period: input.period,
    profile: { ...profile, name: profile.name ?? input.accountName ?? null },
    followers,
    impressions,
    engagement: { reactions: input.reactions, comments: input.comments, reshares: input.reshares, rate },
  };
}

export function normalizePosts(json: unknown, limit = 10): SupergrowPostSummary[] {
  const arr = Array.isArray(asObj(json).posts) ? (asObj(json).posts as unknown[]) : [];
  return arr.slice(0, limit).map((p) => {
    const o = asObj(p);
    const text = typeof o.text === "string" ? o.text : "";
    return {
      id: String(o.id ?? ""),
      content: text.slice(0, 160),
      impressions: num(o.impressions_count),
      reactions: num(o.likes_count),
      comments: num(o.comments_count),
      reshares: num(o.reshares_count),
      status: String(o.status ?? ""),
      postedAt:
        typeof o.published_at === "string"
          ? o.published_at
          : typeof o.scheduled_at === "string"
            ? o.scheduled_at
            : null,
      url: typeof o.public_url === "string" ? o.public_url : typeof o.app_url === "string" ? o.app_url : null,
    };
  });
}

/** Rank recent posts by impressions (for the "top posts" performance view). */
export function rankPostsByImpressions(posts: SupergrowPostSummary[], limit: number): SupergrowPostSummary[] {
  return [...posts].sort((a, b) => b.impressions - a.impressions).slice(0, limit);
}
