"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink, Loader2, RefreshCw, TrendingUp, Users, Mail, BarChart2, AlertCircle, Settings, Play, Heart, Eye } from "lucide-react";
import { PageHeader } from "../../components/page-header";
import { studioInner } from "@/lib/studio/inner-classes";
import { cn } from "@/lib/utils";
import type { UnifiedAnalyticsPayload } from "@/lib/integrations/types";
import type { BeehiivPublicationStats, BeehiivPostSummary } from "@/lib/integrations/beehiiv/normalize";
import type { SupergrowAnalytics, SupergrowPostSummary } from "@/lib/integrations/supergrow/normalize";
import { AskPanel, type AskPlatform } from "../_components/ask-panel";

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

const fmtPct = (n: number | undefined | null) => (n != null ? `${n.toFixed(1)}%` : "—");
const fmtNum = (n: number | undefined | null) => (n != null ? Math.round(n).toLocaleString() : "—");
const fmtSigned = (n: number | undefined | null) =>
  n == null ? "—" : `${n > 0 ? "+" : ""}${Math.round(n).toLocaleString()}`;

export default function UnifiedAnalyticsPage() {
  const [payload, setPayload] = useState<UnifiedAnalyticsPayload | null>(null);
  const [posts, setPosts] = useState<BeehiivPostSummary[]>([]);
  const [sgPosts, setSgPosts] = useState<SupergrowPostSummary[]>([]);
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
      const result = (await res.json().catch(() => ({}))) as { status?: string; summary?: string; error?: string };
      if (!res.ok) throw new Error(result.error || result.summary || `Run failed (HTTP ${res.status})`);
      if (result.status === "completed") await refreshHealth();
      else setHealthError(result.summary || result.error || "Run did not complete");
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
      const [analyticsRes, postsRes, sgPostsRes, healthRes] = await Promise.all([
        fetch("/api/integrations/analytics"),
        fetch("/api/integrations/beehiiv/action", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tool: "list_posts", params: { limit: 5, status: "confirmed" } }),
        }),
        fetch("/api/integrations/supergrow/action", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tool: "get_post_performance", params: { limit: 5 } }),
        }),
        fetch("/api/pipelines/health-report/status"),
      ]);

      setPayload((await analyticsRes.json()) as UnifiedAnalyticsPayload);

      if (postsRes.ok) {
        const pd = (await postsRes.json()) as { ok: boolean; data?: { posts?: BeehiivPostSummary[] } };
        if (pd.ok) setPosts(pd.data?.posts ?? []);
      }
      if (sgPostsRes.ok) {
        const sd = (await sgPostsRes.json()) as { ok: boolean; data?: { posts?: SupergrowPostSummary[] } };
        if (sd.ok) setSgPosts(sd.data?.posts ?? []);
      }
      if (healthRes.ok) {
        const hd = (await healthRes.json()) as { metrics?: HealthMetric[] };
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
  const beehiivStats = beehiiv?.data as BeehiivPublicationStats | undefined;
  const sg = supergrow?.data as SupergrowAnalytics | undefined;

  const topPost = posts.reduce<BeehiivPostSummary | null>(
    (best, p) => (p.openRate > (best?.openRate ?? 0) ? p : best),
    null
  );

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
          <button type="button" onClick={() => void load()} disabled={loading} className={studioInner.btnSecondary}>
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

      {/* Beehiiv metric rail */}
      {beehiiv?.enabled && !beehiiv?.error && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <StatCard label="Active subscribers" value={fmtNum(beehiivStats?.activeSubscribers)} sub="Beehiiv" icon={<Users className="h-4 w-4" />} />
          <StatCard label="Net new (4 wks)" value={fmtSigned(beehiivStats?.netSubscribers)} sub="Beehiiv" icon={<TrendingUp className="h-4 w-4" />} />
          <StatCard label="Open rate (4 wks)" value={fmtPct(beehiivStats?.openRate)} sub="Beehiiv" icon={<Mail className="h-4 w-4" />} />
          <StatCard label="Click rate (4 wks)" value={fmtPct(beehiivStats?.clickRate)} sub="Beehiiv" icon={<BarChart2 className="h-4 w-4" />} />
        </div>
      )}

      {/* Supergrow metric rail */}
      {supergrow?.enabled && !supergrow?.error && sg && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
          <StatCard label="Followers" value={fmtNum(sg.followers?.current)} sub={`LinkedIn · ${fmtSigned(sg.followers?.totalChange)}`} icon={<Users className="h-4 w-4" />} />
          <StatCard label="Impressions (30d)" value={fmtNum(sg.impressions?.total)} sub={`LinkedIn · ${sg.impressions?.trendDirection || "—"}`} icon={<Eye className="h-4 w-4" />} />
          <StatCard label="Engagement rate" value={fmtPct(sg.engagement?.rate)} sub="LinkedIn" icon={<Heart className="h-4 w-4" />} />
          <StatCard label="Reactions (30d)" value={fmtNum(sg.engagement?.reactions)} sub="LinkedIn" icon={<TrendingUp className="h-4 w-4" />} />
        </div>
      )}

      <div className="space-y-6">
        {/* Ask your data — conversational, runs the MCP tools per platform */}
        <AskPanel
          platforms={(
            [
              { id: "beehiiv", name: "Beehiiv", suggested: ["Give me a performance overview", "What are my top posts by open rate?", "How many active subscribers do I have?"] },
              { id: "supergrow", name: "Supergrow", suggested: ["Give me a LinkedIn performance overview", "What are my top posts by impressions?", "How are my followers trending?"] },
            ] as AskPlatform[]
          ).filter((p) => payload?.platforms?.[p.id]?.enabled)}
        />

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
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-[#C8571E] text-sm">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {beehiiv.error}
              </div>
              <a href="/api/integrations/beehiiv/oauth/start" className={cn(studioInner.btnPrimary, "inline-flex w-fit")}>
                Connect Beehiiv
              </a>
            </div>
          ) : posts.length > 0 ? (
            <div className="space-y-2">
              <p className={cn(studioInner.sectionLabel, "mb-3")}>Recent posts</p>
              {posts.map((post) => (
                <div
                  key={post.id || post.title}
                  className={cn(
                    studioInner.surfaceNested,
                    "rounded-lg px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2",
                    topPost && post.id === topPost.id && "ring-1 ring-[#C8571E]/30"
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[#1F1A14] truncate">{post.title}</p>
                    {topPost && post.id === topPost.id && (
                      <span className={cn(studioInner.tag, studioInner.tagOrange, "mt-1")}>Top performer</span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 shrink-0 text-[11px] font-[family-name:var(--font-geist-mono)] text-[#6B5F4E]">
                    <span>Open {fmtPct(post.openRate)}</span>
                    <span>Click {fmtPct(post.clickRate)}</span>
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
        </PlatformSection>

        {/* Supergrow section */}
        <PlatformSection name="Supergrow" enabled={supergrow?.enabled ?? false} platformId="supergrow">
          {!supergrow?.enabled ? (
            <p className={studioInner.body}>
              Set <code className="font-mono text-[11px] bg-[#EBDFC5] px-1 rounded">SUPERGROW_MCP_SERVER_URL</code> (and{" "}
              <code className="font-mono text-[11px] bg-[#EBDFC5] px-1 rounded">SUPERGROW_WORKSPACE_ID</code>) to connect LinkedIn analytics.{" "}
              <Link href="/integrations" className={studioInner.link}>Manage integrations →</Link>
            </p>
          ) : supergrow?.error ? (
            <div className="flex items-center gap-2 text-[#C8571E] text-sm">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {supergrow.error}
            </div>
          ) : (
            <div className="space-y-4">
              {sg?.profile?.profileUrl && (
                <a href={sg.profile.profileUrl} target="_blank" rel="noopener noreferrer" className={cn(studioInner.body, "flex items-center gap-1 text-[11px] hover:underline")}>
                  {sg.profile.name ?? "LinkedIn profile"} <ExternalLink className="h-3 w-3" />
                </a>
              )}
              {sgPosts.length > 0 ? (
                <div className="space-y-2">
                  <p className={cn(studioInner.sectionLabel, "mb-3")}>Top posts by impressions</p>
                  {sgPosts.map((post, i) => (
                    <div
                      key={post.id || i}
                      className={cn(
                        studioInner.surfaceNested,
                        "rounded-lg px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2",
                        i === 0 && "ring-1 ring-[#C8571E]/30"
                      )}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[#1F1A14] line-clamp-2">{post.content || "(no text)"}</p>
                        {i === 0 && <span className={cn(studioInner.tag, studioInner.tagOrange, "mt-1")}>Top performer</span>}
                      </div>
                      <div className="flex items-center gap-4 shrink-0 text-[11px] font-[family-name:var(--font-geist-mono)] text-[#6B5F4E]">
                        <span className="inline-flex items-center gap-1"><Eye className="h-3 w-3" />{fmtNum(post.impressions)}</span>
                        <span className="inline-flex items-center gap-1"><Heart className="h-3 w-3" />{fmtNum(post.reactions)}</span>
                        <span>{fmtNum(post.comments)} comments</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : loading ? (
                <div className="flex items-center gap-2 text-[#6B5F4E] text-sm py-4">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading LinkedIn posts…
                </div>
              ) : sg ? (
                <p className={studioInner.body}>
                  {sg.followers?.current != null
                    ? `${fmtNum(sg.followers.current)} followers · ${fmtNum(sg.impressions?.total)} impressions (30d).`
                    : "LinkedIn analytics loaded."}
                </p>
              ) : (
                <p className={studioInner.body}>LinkedIn analytics loaded.</p>
              )}
            </div>
          )}
        </PlatformSection>
      </div>
    </div>
  );
}
