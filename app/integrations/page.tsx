"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { BarChart2, CheckCircle, ExternalLink, Loader2, XCircle } from "lucide-react";
import { PageHeader } from "../components/page-header";
import { studioInner } from "@/lib/studio/inner-classes";
import { cn } from "@/lib/utils";
import type { IntegrationListItem, IntegrationFeature } from "@/lib/integrations/types";

const FEATURE_LABELS: Record<IntegrationFeature, string> = {
  analytics: "Analytics",
  scheduling: "Scheduling",
  publishing: "Publishing",
  audience: "Audience",
};

function FeatureBadge({ feature }: { feature: IntegrationFeature }) {
  return (
    <span className={studioInner.tag}>{FEATURE_LABELS[feature]}</span>
  );
}

export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<IntegrationListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/integrations");
      const data = await res.json() as { integrations?: IntegrationListItem[]; error?: string };
      if (!res.ok || data.error) {
        setError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      setIntegrations(data.integrations ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load integrations");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className={studioInner.pageRoot}>
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-2">
        <PageHeader
          variant="studio"
          title="Integrations"
          description="Connect external platforms to Cornerstone. Any MCP-compatible service can be plugged in."
        />
        <Link href="/integrations/analytics" className={cn(studioInner.btnPrimary, "shrink-0 mt-1 self-start")}>
          <BarChart2 className="h-4 w-4" />
          View analytics
        </Link>
      </div>

      {error && (
        <p className="mb-6 text-sm text-[#C8571E]">{error}</p>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-[#6B5F4E] py-12 justify-center">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Loading integrations…</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {integrations.map((integration) => (
            <div key={integration.id} className={studioInner.card}>
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <h2 className="font-[family-name:var(--font-instrument-serif)] text-xl text-[#1F1A14]">
                    {integration.name}
                  </h2>
                  <p className={cn(studioInner.body, "mt-1")}>{integration.description}</p>
                </div>
                <div className="shrink-0 mt-0.5">
                  {integration.enabled ? (
                    <CheckCircle className="h-5 w-5 text-[#3F6B45]" />
                  ) : (
                    <XCircle className="h-5 w-5 text-[#9C8E78]" />
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5 mb-4">
                {integration.features.map((f) => (
                  <FeatureBadge key={f} feature={f} />
                ))}
              </div>

              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    studioInner.tag,
                    integration.enabled ? studioInner.tagGreen : "bg-[#E4D9C2] text-[#9C8E78]"
                  )}
                >
                  {integration.enabled ? "Connected" : "Not configured"}
                </span>
                {integration.enabled && (
                  <Link
                    href={`/integrations/${integration.id}`}
                    className="ml-auto inline-flex items-center gap-1 text-[11px] text-[#C8571E] font-medium hover:underline"
                  >
                    Open dashboard <ExternalLink className="h-3 w-3" />
                  </Link>
                )}
              </div>

              {!integration.enabled && (
                <p className={cn(studioInner.body, "mt-3 text-[11px]")}>
                  {integration.id === "beehiiv" &&
                    "Requires BEEHIIV_API_KEY and BEEHIIV_PUBLICATION_ID environment variables."}
                  {integration.id === "supergrow" &&
                    "Requires SUPERGROW_API_KEY environment variable."}
                </p>
              )}
            </div>
          ))}

          {/* Future integration slot */}
          <div className={cn(studioInner.card, "border-dashed opacity-60 flex flex-col items-center justify-center py-10 text-center gap-2")}>
            <p className={cn(studioInner.sectionLabel, "mb-0")}>Add integration</p>
            <p className={cn(studioInner.body, "text-[11px] max-w-[200px]")}>
              Any MCP-compatible platform can be plugged in via the integration registry.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
