import { supabaseAdmin } from "@/lib/supabase/server";

export type LoadDraftResult =
  | { ok: true; contentJson: Record<string, unknown>; draftId: string }
  | { ok: false; error: string; Status: 400 | 404 | 500 };

export async function loadDraftContentJson(
  draftId: string | undefined,
  workspaceId: string
): Promise<LoadDraftResult> {
  if (!draftId?.trim()) {
    return { ok: false, error: "draftId required", Status: 400 };
  }
  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from("issue_drafts")
    .select("id, content_json")
    .eq("id", draftId.trim())
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (error) {
    return { ok: false, error: error.message, Status: 500 };
  }
  if (!data?.content_json || typeof data.content_json !== "object") {
    return { ok: false, error: "Draft not found or has no content_json", Status: 404 };
  }
  return {
    ok: true,
    draftId: data.id as string,
    contentJson: data.content_json as Record<string, unknown>,
  };
}
