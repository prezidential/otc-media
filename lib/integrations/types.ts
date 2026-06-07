import type { SupabaseClient } from "@supabase/supabase-js";

export type IntegrationFeature = "analytics" | "scheduling" | "publishing" | "audience";

export type IntegrationTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

/**
 * Request-scoped context passed to callTool so plugins can resolve per-workspace
 * credentials (e.g. Beehiiv MCP OAuth tokens). Optional for backward compat;
 * env-based plugins ignore it.
 */
export type IntegrationToolContext = {
  workspaceId: string;
  userId: string;
  supabase: SupabaseClient;
  /** App origin (for OAuth client/token lookups). */
  origin?: string;
};

export type IntegrationPlugin = {
  id: string;
  name: string;
  description: string;
  features: IntegrationFeature[];
  tools: IntegrationTool[];
  callTool: (name: string, params: Record<string, unknown>, ctx?: IntegrationToolContext) => Promise<unknown>;
  isEnabled: () => boolean;
  analyticsConfig: {
    systemPrompt: string;
    defaultQueries: string[];
  };
};

export type IntegrationQueryResult = {
  ok: boolean;
  summary: string;
  data: Record<string, unknown>;
  decisions: string[];
  error?: string;
};

export type IntegrationListItem = {
  id: string;
  name: string;
  description: string;
  features: IntegrationFeature[];
  enabled: boolean;
};

export type UnifiedAnalyticsPayload = {
  ok: boolean;
  fetchedAt: string;
  platforms: Record<string, PlatformAnalyticsSnapshot>;
};

export type PlatformAnalyticsSnapshot = {
  enabled: boolean;
  name: string;
  data?: Record<string, unknown>;
  error?: string;
};
