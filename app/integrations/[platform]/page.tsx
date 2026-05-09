"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { AlertCircle, ArrowLeft, Loader2, Send, Sparkles } from "lucide-react";
import { PageHeader } from "../../components/page-header";
import { studioInner } from "@/lib/studio/inner-classes";
import { cn } from "@/lib/utils";
import type { IntegrationListItem } from "@/lib/integrations/types";

type StatusResult = { ok: boolean; enabled?: boolean; error?: string };
type QueryResult = { ok: boolean; summary: string; data: Record<string, unknown>; error?: string };
type ActionResult = { ok: boolean; data?: unknown; error?: string };

const PLATFORM_QUERIES: Record<string, string[]> = {
  beehiiv: [
    "Give me a full performance overview",
    "What are my top posts by open rate?",
    "How many active subscribers do I have?",
  ],
  supergrow: [
    "Give me a LinkedIn performance overview",
    "What are my top posts by impressions?",
    "Show me my post schedule for this week",
  ],
};

const PLATFORM_QUICK_TOOLS: Record<string, { tool: string; label: string }[]> = {
  beehiiv: [
    { tool: "get_publication_stats", label: "Publication stats" },
    { tool: "list_posts", label: "Recent posts" },
  ],
  supergrow: [
    { tool: "get_linkedin_analytics", label: "LinkedIn analytics" },
    { tool: "list_scheduled_posts", label: "Scheduled posts" },
  ],
};

export default function PlatformDashboardPage() {
  const params = useParams<{ platform: string }>();
  const platform = params.platform;

  const [integration, setIntegration] = useState<IntegrationListItem | null>(null);
  const [status, setStatus] = useState<StatusResult | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);

  const [query, setQuery] = useState("");
  const [queryLoading, setQueryLoading] = useState(false);
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null);

  const [activeToolResult, setActiveToolResult] = useState<{ tool: string; data: unknown } | null>(null);
  const [toolLoading, setToolLoading] = useState<string | null>(null);

  const [showRaw, setShowRaw] = useState(false);

  const loadStatus = useCallback(async () => {
    setLoadingStatus(true);
    try {
      const [listRes, statusRes] = await Promise.all([
        fetch("/api/integrations"),
        fetch(`/api/integrations/${platform}/status`),
      ]);
      const listData = await listRes.json() as { integrations?: IntegrationListItem[] };
      const found = listData.integrations?.find((i) => i.id === platform) ?? null;
      setIntegration(found);

      const statusData = await statusRes.json() as StatusResult;
      setStatus(statusData);
    } finally {
      setLoadingStatus(false);
    }
  }, [platform]);

  useEffect(() => { void loadStatus(); }, [loadStatus]);

  async function runQuery() {
    if (!query.trim()) return;
    setQueryLoading(true);
    setQueryResult(null);
    try {
      const res = await fetch(`/api/integrations/${platform}/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const data = await res.json() as QueryResult;
      setQueryResult(data);
    } finally {
      setQueryLoading(false);
    }
  }

  async function runTool(tool: string) {
    setToolLoading(tool);
    setActiveToolResult(null);
    try {
      const defaultParams: Record<string, Record<string, unknown>> = {
        list_posts: { limit: 5, status: "confirmed" },
        list_scheduled_posts: { limit: 10 },
        get_linkedin_analytics: { period: "30d" },
      };
      const res = await fetch(`/api/integrations/${platform}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool, params: defaultParams[tool] ?? {} }),
      });
      const data = await res.json() as ActionResult;
      if (data.ok) setActiveToolResult({ tool, data: data.data });
    } finally {
      setToolLoading(null);
    }
  }

  const suggestedQueries = PLATFORM_QUERIES[platform] ?? [];
  const quickTools = PLATFORM_QUICK_TOOLS[platform] ?? [];

  if (loadingStatus) {
    return (
      <div className={cn(studioInner.pageRoot, "flex items-center gap-2 text-[#6B5F4E] py-20 justify-center")}>
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">Loading…</span>
      </div>
    );
  }

  if (!integration) {
    return (
      <div className={studioInner.pageRoot}>
        <div className={cn(studioInner.card, "flex flex-col items-center gap-3 py-12 text-center")}>
          <AlertCircle className="h-6 w-6 text-[#9C8E78]" />
          <p className={studioInner.body}>Integration <strong>{platform}</strong> not found.</p>
          <Link href="/integrations" className={studioInner.link}>← Back to integrations</Link>
        </div>
      </div>
    );
  }

  return (
    <div className={studioInner.pageRoot}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/integrations" className={cn(studioInner.btnSecondary, "!px-3")}>
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1">
          <PageHeader
            variant="studio"
            title={integration.name}
            description={integration.description}
          />
        </div>
      </div>

      {/* Status */}
      <div className={cn(studioInner.card, "mb-6 flex items-center gap-3")}>
        <span
          className={cn(
            studioInner.tag,
            integration.enabled ? studioInner.tagGreen : "bg-[#E4D9C2] text-[#9C8E78]"
          )}
        >
          {integration.enabled ? "Connected" : "Not configured"}
        </span>
        {status && !status.ok && status.error && (
          <span className="text-sm text-[#C8571E] flex items-center gap-1.5">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {status.error}
          </span>
        )}
        {status?.ok && (
          <span className={cn(studioInner.body, "text-[11px]")}>API connection verified</span>
        )}
        <div className="ml-auto flex flex-wrap gap-1.5">
          {integration.features.map((f) => (
            <span key={f} className={studioInner.tag}>{f}</span>
          ))}
        </div>
      </div>

      {!integration.enabled ? (
        <div className={studioInner.card}>
          <p className={studioInner.body}>
            This integration is not configured.{" "}
            {platform === "beehiiv" && (
              <>Set <code className="font-mono text-[11px] bg-[#EBDFC5] px-1 rounded">BEEHIIV_API_KEY</code> and <code className="font-mono text-[11px] bg-[#EBDFC5] px-1 rounded">BEEHIIV_PUBLICATION_ID</code> environment variables to enable it.</>
            )}
            {platform === "supergrow" && (
              <>Set <code className="font-mono text-[11px] bg-[#EBDFC5] px-1 rounded">SUPERGROW_API_KEY</code> to enable it.</>
            )}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Quick stats */}
          {quickTools.length > 0 && (
            <section className={studioInner.card}>
              <p className={studioInner.sectionLabel}>Quick data</p>
              <div className="flex flex-wrap gap-2 mb-4">
                {quickTools.map(({ tool, label }) => (
                  <button
                    key={tool}
                    type="button"
                    onClick={() => void runTool(tool)}
                    disabled={toolLoading === tool}
                    className={studioInner.btnSecondary}
                  >
                    {toolLoading === tool ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                    {label}
                  </button>
                ))}
              </div>
              {activeToolResult && (
                <div className={cn(studioInner.surfaceNested, "rounded-lg p-4")}>
                  <p className={cn(studioInner.sectionLabel, "mb-2")}>{activeToolResult.tool}</p>
                  <pre className={studioInner.draftBodyPreMono}>
                    {JSON.stringify(activeToolResult.data, null, 2)}
                  </pre>
                </div>
              )}
            </section>
          )}

          {/* AI query */}
          <section className={studioInner.card}>
            <p className={studioInner.sectionLabel}>
              <Sparkles className="h-3.5 w-3.5" />
              Ask AI
            </p>
            <div className="flex gap-2 mb-3">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !queryLoading && void runQuery()}
                placeholder={`Ask about your ${integration.name} data…`}
                className={cn(studioInner.input, "flex-1")}
              />
              <button
                type="button"
                onClick={() => void runQuery()}
                disabled={queryLoading || !query.trim()}
                className={studioInner.btnPrimary}
              >
                {queryLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5 mb-4">
              {suggestedQueries.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => { setQuery(q); void runQuery(); }}
                  className="rounded-full border border-[#E4D9C2] px-3 py-1 text-[11px] text-[#6B5F4E] hover:bg-[#EBDFC5]/50 transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>

            {queryResult && (
              <div className={cn(studioInner.surfaceNested, "rounded-lg p-4 space-y-3")}>
                {queryResult.ok ? (
                  <>
                    <p className="text-[13px] leading-relaxed text-[#1F1A14]">{queryResult.summary}</p>
                    <button
                      type="button"
                      onClick={() => setShowRaw((v) => !v)}
                      className="text-[11px] text-[#6B5F4E] hover:underline"
                    >
                      {showRaw ? "Hide raw data" : "Show raw data"}
                    </button>
                    {showRaw && (
                      <pre className={studioInner.draftBodyPreMono}>
                        {JSON.stringify(queryResult.data, null, 2)}
                      </pre>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-[#C8571E] flex items-center gap-1.5">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    {queryResult.error ?? "Query failed"}
                  </p>
                )}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
