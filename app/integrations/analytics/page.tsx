"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink, Loader2, RefreshCw, TrendingUp, Users, Mail, BarChart2, AlertCircle, Settings, Play } from "lucide-react";
import { PageHeader } from "../../components/page-header";
import { studioInner } from "@/lib/studio/inner-classes";
import { cn } from "@/lib/utils";
import type { UnifiedAnalyticsPayload } from "@/lib/integrations/types";

type BeehiivStats = {
  data?: {
    total_active_subscriptions?: number;
    total_subscriptions?: number;
    average_open_rate?: number;
    average_click_rate?: number;
  };
};

type BeehiivPost = {
  id?: string;
  subject?: string;
  status?: string;
  stats?: {
    open_rate?: number;
    click_rate?: number;
  };
  publish_date?: number;
};

type BeehiivPostsData = {
  data?: BeehiivPost[];
};

type HealthMetric = {
  key: string;
  label: string;
  value: number | null;
  status: "green" | "yellow" | "red";
  target: number;
  warn: number;
  kind: "standard" | "inverted";
  unit: "percent" | "count";
  consecutiveWeeksBelow: number;
  week: number | null;
  updatedAt: string;
};

const HEALTH_STATUS_EMOJI: Record<HealthMetric["status"], string> = {
  green: "✅",
  yellow: "🟡",
  red: "🔴",
};

function SubscriberHealthSection({
  metrics,
  onRun,
  running,
  runError,
}: {
  metrics: HealthMetric[];
  onRun: () => void;
  running: boolean;
  runError: string | null;
}) {
  const fmtValue = (m: HealthMetric) => {
    if (m.value == null) return "—";
    return m.unit === "percent" ? `${Math.round(m.value * 10) / 10}%` : `${Math.round(m.value)}`;
  };
  const fmtTarget = (m: HealthMetric) => {
    const suffix = m.unit === "percent" ? "%" : "";
    const lead = m.kind === "inverted" ? "<" : "";
    return `target: ${lead}${m.target}${suffix}`;
  };

  return (
    <section className={studioInner.card}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h2 className="font-[family-name:var(--font-instrument-serif)] text-xl text-[#1F1A14]">
            Subscriber Health
          </h2>
          {metrics[0]?.week != null && (
            <span className={cn(studioInner.body, "text-[11px] font-[family-name:var(--font-geist-mono)]")}>
              Week {metrics[0].week}
            </span>
          )}
        </div>
        <button type="button" onClick={onRun} disabled={running} className={studioInner.btnSecondary}>
          {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
          Run now
        </button>
      </div>

      {runError && (
        <div className="mb-3 flex items-center gap-2 text-[#C8571E] text-sm">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {runError}
        </div>
      )}

      {metrics.length === 0 ? (
        <p className={studioInner.body}>
          {running ? "Running report…" : "No health report yet — runs weekly, or run it now."}
        </p>
      ) : (
        <div className="space-y-2">
          {metrics.map((m) => (
            <div
              key={m.key}
              className={cn(
                studioInner.surfaceNested,
                "rounded-lg px-4 py-3 flex items-center gap-3",
                m.status === "red" && "ring-1 ring-[#C8571E]/30"
              )}
            >
              <span className="text-base shrink-0" aria-label={m.status}>
                {HEALTH_STATUS_EMOJI[m.status]}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[#1F1A14]">{m.label}</p>
                {m.consecutiveWeeksBelow >= 3 && (
                  <p className="text-[11px] text-[#C8571E] mt-0.5">
                    ⚠️ below threshold for {m.consecutiveWeeksBelow} consecutive weeks
                  </p>
                )}
              </div>
              <div className="shrink-0 text-right">
                <div className="text-lg font-semibold tabular-nums text-[#1F1A14]">{fmtValue(m)}</div>
                <div className="text-[11px] font-[family-name:var(--font-geist-mono)] text-[#6B5F4E]">
                  {fmtTarget(m)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function StatCard({ label, value, sub, icon }: { label: string; value: string; sub?: string; icon: React.ReactNode }) {
  return (
    <div className={cn(studioInner.card, "flex flex-col gap-1")}>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[#C8571E]">{icon}</span>
        <span className={studioInner.sectionLabel}>{label}</span>
      </div>
      <div className="text-2xl font-semibold tabular-nums text-[#1F1A14]">{value}</div>
      {sub && <div className={cn(studioInner.body, "text-[11px]")}>{sub}</div>}
    </div>
  );
}

function PlatformSection({
  name,
  enabled,
  children,
  platformId,
}: {
  name: string;
  enabled: boolean;
  children?: React.ReactNode;
  platformId: string;
}) {
  return (
    <section className={studioInner.card}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h2 className="font-[family-name:var(--font-instrument-serif)] text-xl text-[#1F1A14]">{name}</h2>
          <span
            className={cn(
              studioInner.tag,
              enabled ? studioInner.tagGreen : "bg-[#E4D9C2] text-[#9C8E78]"
            )}
          >
            {enabled ? "Connected" : "Not configured"}
          </span>
        </div>
        <Link href={`/integrations/${platformId}`} className={cn(studioInner.body, "flex items-center gap-1 hover:underline text-[11px]")}>
          Open <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
      {children}
    </section>
  );
}

export default function UnifiedAnalyticsPage() {
  const [payload, setPayload] = useState<UnifiedAnalyticsPayload | null>(null);
  const [postsData, setPostsData] = useState<BeehiivPostsData | null>(null);
  const [healthMetrics, setHealthMetrics] = useState<HealthMetric[]>([]);
  const [healthRunning, setHealthRunning] = useState(false);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshHealth = useCallback(async () => {
    const res = await fetch("/api/pipelines/health-report/status");
    if (res.ok) {
      const hd = (await res.json()) as { metrics?: HealthMetric[] };
      setHealthMetrics(hd.metrics ?? []);
    }
  }, []);

  const runHealth = useCallback(async () => {
    setHealthRunning(true);
    setHealthError(null);
    try {
      const res = await fetch("/api/pipelines/health-report/run", { method: "POST" });
      const result = (await res.json().catch(() => ({}))) as {
        status?: string;
        summary?: string;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(result.error || result.summary || `Run failed (HTTP ${res.status})`);
      }
      if (result.status === "completed") {
        await refreshHealth();
      } else {
        // skipped (e.g. Beehiiv not configured) or failed — surface the reason.
        setHealthError(result.summary || result.error || "Run did not complete");
      }
    } catch (e) {
      setHealthError(e instanceof Error ? e.message : "Run failed");
    } finally {
      setHealthRunning(false);
    }
  }, [refreshHealth]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [analyticsRes, postsRes, healthRes] = await Promise.all([
        fetch("/api/integrations/analytics"),
        fetch("/api/integrations/beehiiv/action", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tool: "list_posts", params: { limit: 5, status: "confirmed" } }),
        }),
        fetch("/api/pipelines/health-report/status"),
      ]);

      const analyticsData = await analyticsRes.json() as UnifiedAnalyticsPayload;
      setPayload(analyticsData);

      if (postsRes.ok) {
        const pd = await postsRes.json() as { ok: boolean; data?: BeehiivPostsData };
        if (pd.ok && pd.data) setPostsData(pd.data);
      }

      if (healthRes.ok) {
        const hd = await healthRes.json() as { metrics?: HealthMetric[] };
        setHealthMetrics(hd.metrics ?? []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load analytics");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const beehiiv = payload?.platforms?.beehiiv;
  const supergrow = payload?.platforms?.supergrow;
  const beehiivStats = beehiiv?.data as BeehiivStats | undefined;
  const activeSubscribers = beehiivStats?.data?.total_active_subscriptions;
  const totalSubscribers = beehiivStats?.data?.total_subscriptions;
  const openRate = beehiivStats?.data?.average_open_rate;
  const clickRate = beehiivStats?.data?.average_click_rate;

  const posts = postsData?.data ?? [];
  const topPost = posts.reduce<BeehiivPost | null>((best, p) => {
    const rate = p.stats?.open_rate ?? 0;
    return rate > (best?.stats?.open_rate ?? 0) ? p : best;
  }, null);

  const fmt = (n: number | undefined, suffix = "") =>
    n != null ? `${(n * 100).toFixed(1)}%${suffix}` : "—";
  const fmtNum = (n: number | undefined) =>
    n != null ? n.toLocaleString() : "—";

  return (
    <div className={studioInner.pageRoot}>
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-2">
        <PageHeader
          variant="studio"
          title="Analytics"
          description="All-up performance across your connected platforms."
        />
        <div className="flex items-center gap-3 shrink-0 mt-1">
          {payload?.fetchedAt && (
            <span className={cn(studioInner.body, "text-[11px] font-[family-name:var(--font-geist-mono)]")}>
              Updated {new Date(payload.fetchedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
            </span>
          )}
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className={studioInner.btnSecondary}
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Refresh
          </button>
          <Link href="/integrations" className={studioInner.btnSecondary}>
            <Settings className="h-3.5 w-3.5" />
            Manage
          </Link>
        </div>
      </div>

      {error && (
        <div className={cn(studioInner.card, "mb-6 flex items-center gap-2 text-[#C8571E]")}>
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {/* Metric rail */}
      {beehiiv?.enabled && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
          <StatCard label="Active subscribers" value={fmtNum(activeSubscribers)} sub="Beehiiv" icon={<Users className="h-4 w-4" />} />
          <StatCard label="Total subscribers" value={fmtNum(totalSubscribers)} sub="Beehiiv" icon={<TrendingUp className="h-4 w-4" />} />
          <StatCard label="Avg open rate" value={fmt(openRate)} sub="Beehiiv · all time" icon={<Mail className="h-4 w-4" />} />
          <StatCard label="Avg click rate" value={fmt(clickRate)} sub="Beehiiv · all time" icon={<BarChart2 className="h-4 w-4" />} />
        </div>
      )}

      <div className="space-y-6">
        {/* Subscriber Health (KPI status from the weekly pipeline) */}
        <SubscriberHealthSection
          metrics={healthMetrics}
          onRun={runHealth}
          running={healthRunning}
          runError={healthError}
        />

        {/* Beehiiv section */}
        <PlatformSection name="Beehiiv" enabled={beehiiv?.enabled ?? false} platformId="beehiiv">
          {!beehiiv?.enabled ? (
            <p className={studioInner.body}>
              Set <code className="font-mono text-[11px] bg-[#EBDFC5] px-1 rounded">BEEHIIV_API_KEY</code> and{" "}
              <code className="font-mono text-[11px] bg-[#EBDFC5] px-1 rounded">BEEHIIV_PUBLICATION_ID</code> to connect.{" "}
              <Link href="/integrations" className={studioInner.link}>Manage integrations →</Link>
            </p>
          ) : beehiiv?.error ? (
            <div className="flex items-center gap-2 text-[#C8571E] text-sm">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {beehiiv.error}
            </div>
          ) : (
            <div>
              {posts.length > 0 ? (
                <div className="space-y-2">
                  <p className={cn(studioInner.sectionLabel, "mb-3")}>Recent posts</p>
                  {posts.map((post) => (
                    <div
                      key={post.id ?? post.subject}
                      className={cn(
                        studioInner.surfaceNested,
                        "rounded-lg px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2",
                        post.id === topPost?.id && "ring-1 ring-[#C8571E]/30"
                      )}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[#1F1A14] truncate">{post.subject ?? "Untitled"}</p>
                        {post.id === topPost?.id && (
                          <span className={cn(studioInner.tag, studioInner.tagOrange, "mt-1")}>Top performer</span>
                        )}
                      </div>
                      <div className="flex items-center gap-4 shrink-0 text-[11px] font-[family-name:var(--font-geist-mono)] text-[#6B5F4E]">
                        <span>Open {fmt(post.stats?.open_rate)}</span>
                        <span>Click {fmt(post.stats?.click_rate)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : loading ? (
                <div className="flex items-center gap-2 text-[#6B5F4E] text-sm py-4">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading posts…
                </div>
              ) : (
                <p className={studioInner.body}>No published posts found.</p>
              )}
            </div>
          )}
        </PlatformSection>

        {/* Supergrow section */}
        <PlatformSection name="Supergrow" enabled={supergrow?.enabled ?? false} platformId="supergrow">
          {!supergrow?.enabled ? (
            <p className={studioInner.body}>
              Set <code className="font-mono text-[11px] bg-[#EBDFC5] px-1 rounded">SUPERGROW_API_KEY</code> to connect LinkedIn analytics.{" "}
              <Link href="/integrations" className={studioInner.link}>Manage integrations →</Link>
            </p>
          ) : supergrow?.error ? (
            <div className="flex items-center gap-2 text-[#C8571E] text-sm">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {supergrow.error}
            </div>
          ) : (
            <p className={studioInner.body}>LinkedIn data loaded. <Link href="/integrations/supergrow" className={studioInner.link}>View full dashboard →</Link></p>
          )}
        </PlatformSection>
      </div>
    </div>
  );
}
