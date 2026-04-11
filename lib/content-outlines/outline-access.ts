import type { SupabaseClient } from "@supabase/supabase-js";
import type { OutlineKind } from "./types";

export type OutlineAccessResult =
  | { ok: true }
  | { ok: false; status: number; error: string };

/**
 * Ensures an outline exists, is not soft-disabled, and matches expected kind (for issue generation).
 */
export async function assertOutlineUsableForGenerate(
  supabase: SupabaseClient,
  workspaceId: string,
  outlineId: string,
  expectedKind: OutlineKind
): Promise<OutlineAccessResult> {
  const { data, error } = await supabase
    .from("content_outlines")
    .select("id, kind, disabled_at")
    .eq("workspace_id", workspaceId)
    .eq("id", outlineId)
    .maybeSingle();

  if (error) return { ok: false, status: 500, error: error.message };
  if (!data) return { ok: false, status: 404, error: "Outline not found." };
  if (data.disabled_at != null) {
    return { ok: false, status: 400, error: "This outline is disabled. Choose an active outline or use the built-in default." };
  }
  if (data.kind !== expectedKind) {
    return { ok: false, status: 400, error: "Outline kind does not match this operation." };
  }
  return { ok: true };
}
