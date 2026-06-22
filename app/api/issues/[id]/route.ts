import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/auth/session";
import {
  createDraftContent,
  renderDraftMarkdown,
  type DraftContentJson,
} from "@/lib/draft/content";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Load a single issue draft by id (workspace-scoped). Backs the Issues page
 * `?draft=<id>` deep link used by the brainstorm → issues handoff (§3.19 P1b).
 */
export async function GET(_req: Request, routeCtx: Ctx) {
  const { id } = await routeCtx.params;
  if (!id) return NextResponse.json({ error: "draft id required" }, { status: 400 });

  const ctx = await requireWorkspace();
  if (ctx instanceof Response) return ctx;
  const { supabase, workspaceId } = ctx;

  const { data, error } = await supabase
    .from("issue_drafts")
    .select("id,content,content_json,created_at,status")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: "issue_drafts query failed.", detail: error.message },
      { status: 503 }
    );
  }
  if (!data) {
    return NextResponse.json({ error: "Draft not found." }, { status: 404 });
  }

  const response: Record<string, unknown> = {
    id: data.id,
    draft: data.content ?? "",
    created_at: data.created_at,
    status: data.status ?? null,
  };
  if (data.content_json != null) {
    try {
      response.content_json =
        typeof data.content_json === "object" && data.content_json !== null
          ? JSON.parse(JSON.stringify(data.content_json))
          : data.content_json;
    } catch {
      response.content_json = null;
    }
  }
  return NextResponse.json(response);
}

/** Fields a hand-edit is allowed to patch on the draft's content_json. */
const EDITABLE_STRING_FIELDS = [
  "title",
  "fresh_signals",
  "deep_dive",
  "last_word",
  "promo_slot",
  "close",
] as const;
const EDITABLE_ARRAY_FIELDS = ["hook_paragraphs", "sources"] as const;

/**
 * Build a sanitized partial patch from an arbitrary request body. Only known
 * DraftObject fields are accepted; unknown keys are ignored. Strings must be
 * strings; arrays must be string arrays.
 */
function sanitizePatch(body: unknown): {
  patch: Partial<DraftContentJson>;
  hasAny: boolean;
} {
  const patch: Partial<DraftContentJson> = {};
  let hasAny = false;
  if (!body || typeof body !== "object") return { patch, hasAny };
  const src = (body as Record<string, unknown>).content_json ?? body;
  if (!src || typeof src !== "object") return { patch, hasAny };
  const o = src as Record<string, unknown>;

  for (const key of EDITABLE_STRING_FIELDS) {
    if (typeof o[key] === "string") {
      (patch as Record<string, unknown>)[key] = o[key];
      hasAny = true;
    }
  }
  for (const key of EDITABLE_ARRAY_FIELDS) {
    if (Array.isArray(o[key])) {
      const arr = (o[key] as unknown[]).filter((x): x is string => typeof x === "string");
      (patch as Record<string, unknown>)[key] = arr;
      hasAny = true;
    }
  }
  return { patch, hasAny };
}

/**
 * P0-1 — inline draft editor: hand-edit a draft's body. Persists the updated
 * `content_json` (merged onto the stored shape) and re-renders the markdown
 * `content` so downstream consumers (publish, content products) stay in sync.
 *
 * Workspace-scoped via requireWorkspace() + RLS. Does not add DB columns;
 * content_json already tolerates partial shapes (createDraftContent).
 */
export async function PATCH(req: Request, routeCtx: Ctx) {
  const { id } = await routeCtx.params;
  if (!id) return NextResponse.json({ error: "draft id required" }, { status: 400 });

  const body = await req.json().catch(() => null);
  const { patch, hasAny } = sanitizePatch(body);
  if (!hasAny) {
    return NextResponse.json(
      { error: "No editable fields provided in patch." },
      { status: 400 }
    );
  }

  const ctx = await requireWorkspace();
  if (ctx instanceof Response) return ctx;
  const { supabase, workspaceId } = ctx;

  const { data: row, error: loadError } = await supabase
    .from("issue_drafts")
    .select("id, content_json")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (loadError) {
    return NextResponse.json(
      { error: "issue_drafts query failed.", detail: loadError.message },
      { status: 503 }
    );
  }
  if (!row) {
    return NextResponse.json({ error: "Draft not found." }, { status: 404 });
  }

  const existing =
    row.content_json && typeof row.content_json === "object"
      ? (row.content_json as Partial<DraftContentJson>)
      : {};

  // Merge the patch over the existing shape, then normalize through createDraftContent
  // so the stored JSON is always a complete, valid DraftContentJson.
  const merged = { ...existing, ...patch };
  const draft = createDraftContent(merged);
  const updatedJson = draft.toJSON();
  const updatedContent = renderDraftMarkdown(updatedJson);

  const { error: updateError } = await supabase
    .from("issue_drafts")
    .update({ content: updatedContent, content_json: updatedJson })
    .eq("id", id)
    .eq("workspace_id", workspaceId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    id,
    draft: updatedContent,
    content_json: updatedJson,
  });
}
