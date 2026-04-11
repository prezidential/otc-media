import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_INSIDER_OUTLINE, DEFAULT_NEWSLETTER_OUTLINE } from "./default-specs";
import { parseInsiderSpec, parseNewsletterSpec, type InsiderOutlineSpec, type NewsletterOutlineSpec } from "./types";

type OutlineRow = { id: string; spec_json: unknown; kind: string };

function rowsFromSelect(data: unknown): OutlineRow[] {
  if (Array.isArray(data)) return data as OutlineRow[];
  return [];
}

/**
 * Resolve newsletter issue outline: explicit id, else workspace default row, else built-in default.
 */
export async function resolveNewsletterOutline(
  supabase: SupabaseClient,
  workspaceId: string,
  contentOutlineId?: string
): Promise<{ id: string | null; spec: NewsletterOutlineSpec }> {
  const fallback = DEFAULT_NEWSLETTER_OUTLINE;

  try {
    if (contentOutlineId) {
      const { data, error } = await supabase
        .from("content_outlines")
        .select("id, spec_json, kind")
        .eq("workspace_id", workspaceId)
        .eq("id", contentOutlineId)
        .is("disabled_at", null)
        .maybeSingle();

      if (error) {
        if (process.env.NODE_ENV !== "production") {
          console.warn("[content_outlines] fetch by id:", error.message);
        }
        return { id: null, spec: fallback };
      }
      const row = data as { id: string; spec_json: unknown; kind: string } | null;
      if (!row || row.kind !== "newsletter_issue") {
        return { id: null, spec: fallback };
      }
      return { id: row.id, spec: parseNewsletterSpec(row.spec_json, fallback) };
    }

    const { data, error } = await supabase
      .from("content_outlines")
      .select("id, spec_json, kind")
      .eq("workspace_id", workspaceId)
      .eq("kind", "newsletter_issue")
      .eq("is_default", true)
      .is("disabled_at", null)
      .limit(1);

    if (error) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[content_outlines] fetch default:", error.message);
      }
      return { id: null, spec: fallback };
    }

    const row = rowsFromSelect(data)[0];
    if (!row) return { id: null, spec: fallback };
    return { id: row.id, spec: parseNewsletterSpec(row.spec_json, fallback) };
  } catch (e) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[content_outlines] resolveNewsletterOutline:", e);
    }
    return { id: null, spec: fallback };
  }
}

/**
 * Resolve Insider Access outline: explicit id, else workspace default insider row, else built-in default.
 */
export async function resolveInsiderOutline(
  supabase: SupabaseClient,
  workspaceId: string,
  insiderContentOutlineId?: string
): Promise<{ id: string | null; spec: InsiderOutlineSpec }> {
  const fallback = DEFAULT_INSIDER_OUTLINE;

  try {
    if (insiderContentOutlineId) {
      const { data, error } = await supabase
        .from("content_outlines")
        .select("id, spec_json, kind")
        .eq("workspace_id", workspaceId)
        .eq("id", insiderContentOutlineId)
        .is("disabled_at", null)
        .maybeSingle();

      if (error) {
        if (process.env.NODE_ENV !== "production") {
          console.warn("[content_outlines] insider fetch by id:", error.message);
        }
        return { id: null, spec: fallback };
      }
      const row = data as { id: string; spec_json: unknown; kind: string } | null;
      if (!row || row.kind !== "insider_access") {
        return { id: null, spec: fallback };
      }
      return { id: row.id, spec: parseInsiderSpec(row.spec_json, fallback) };
    }

    const { data, error } = await supabase
      .from("content_outlines")
      .select("id, spec_json, kind")
      .eq("workspace_id", workspaceId)
      .eq("kind", "insider_access")
      .eq("is_default", true)
      .is("disabled_at", null)
      .limit(1);

    if (error) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[content_outlines] insider default:", error.message);
      }
      return { id: null, spec: fallback };
    }

    const row = rowsFromSelect(data)[0];
    if (!row) return { id: null, spec: fallback };
    return { id: row.id, spec: parseInsiderSpec(row.spec_json, fallback) };
  } catch (e) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[content_outlines] resolveInsiderOutline:", e);
    }
    return { id: null, spec: fallback };
  }
}
