// lib/integrations/beehiiv/write.ts
//
// Write layer for the Beehiiv integration: create-once, edit-many over the
// Beehiiv MCP write tools, with a REST fallback when no MCP token is available.
//
// This extends the read integration (lib/integrations/beehiiv/index.ts) from
// read-only to read+write, reusing the SAME auth precedence (per-workspace OAuth
// token, then static env token) via `resolveBeehiivMcp`. Where MCP is available
// it calls the official write tools:
//   - save_post          create a new draft post (returns the post id)
//   - edit_post_content  replace an existing draft's body (doc-level replace)
//   - edit_post          patch title / subtitle / SEO / preview text
//   - list_posts         reconcile an existing draft by title (fallback path)
//
// When no MCP token is configured it falls back to the Beehiiv REST API
// (POST/PUT /publications/{pubId}/posts) so behavior degrades gracefully and
// matches the read layer's MCP-with-REST-fallback contract.
//
// Beehiiv has NO API/MCP primitive to insert the premium paywall break; that is
// a manual editor step. This layer never tries to insert it — the publisher
// surfaces a reminder instead. See definition-of-done.md §4 "Hard honesty".

import { withMcp, type McpCall } from "@/lib/integrations/mcp";
import type { IntegrationToolContext } from "@/lib/integrations/types";
import { resolveBeehiivMcp } from "./index";
import { isBeehiivEnabled, type BeehiivPostResult } from "@/lib/publish/beehiiv";

const BEEHIIV_API_BASE = "https://api.beehiiv.com/v2";

export type BeehiivWriteParams = {
  title: string;
  htmlContent: string;
  subtitle?: string;
  /** SEO + social card metadata, passed through to edit_post / save_post. */
  seo?: Record<string, unknown>;
  /** Email preview text (inbox snippet), passed through via email_settings. */
  previewText?: string;
};

export type BeehiivPublishOutcome = BeehiivPostResult & {
  /** "create" when a new draft was made, "update" when an existing one was edited. */
  action: "create" | "update";
  /** Which transport handled the write. */
  transport: "mcp" | "rest";
};

function asObj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

function asStr(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** Build email_settings only when a preview text is supplied (partial patch). */
function emailSettings(previewText?: string): Record<string, unknown> | undefined {
  if (!previewText) return undefined;
  return { preview_text: previewText };
}

// ---------------------------------------------------------------------------
// MCP path
// ---------------------------------------------------------------------------

function postResultFromMcp(raw: unknown, fallbackTitle: string): { id: string; title: string; status: string; web_url: string } {
  const data = asObj(raw);
  const inner = data.post ? asObj(data.post) : data;
  return {
    id: asStr(inner.id),
    title: asStr(inner.title) || fallbackTitle,
    status: asStr(inner.status) || "draft",
    web_url: asStr(inner.web_url),
  };
}

async function createViaMcp(
  call: McpCall,
  pubId: string,
  params: BeehiivWriteParams
): Promise<BeehiivPostResult> {
  const args: Record<string, unknown> = {
    publication_id: pubId,
    title: params.title,
    html_content: params.htmlContent,
  };
  if (params.subtitle) args.subtitle = params.subtitle;
  if (params.seo) args.seo_settings = params.seo;
  const email = emailSettings(params.previewText);
  if (email) args.email_settings = email;

  const res = postResultFromMcp(await call("save_post", args), params.title);
  if (!res.id) throw new Error("Beehiiv save_post returned no post id");
  return res;
}

async function updateViaMcp(
  call: McpCall,
  pubId: string,
  postId: string,
  params: BeehiivWriteParams
): Promise<BeehiivPostResult> {
  // 1) Replace the whole body. A doc-level replace must be the only operation,
  //    which is exactly what we want when re-rendering the full draft.
  await call("edit_post_content", {
    publication_id: pubId,
    post_id: postId,
    operations: [{ type: "replace", target: "doc", content: params.htmlContent }],
  });

  // 2) Patch metadata (title/subtitle/SEO/preview) — partial patch, only sends
  //    the fields we set.
  const metaArgs: Record<string, unknown> = {
    publication_id: pubId,
    post_id: postId,
    title: params.title,
  };
  if (params.subtitle) metaArgs.subtitle = params.subtitle;
  if (params.seo) metaArgs.seo_settings = params.seo;
  const email = emailSettings(params.previewText);
  if (email) metaArgs.email_settings = email;

  const res = postResultFromMcp(await call("edit_post", metaArgs), params.title);
  return { ...res, id: res.id || postId };
}

/** Find an existing draft post id by exact (case-insensitive) title match. */
async function findDraftIdByTitleMcp(
  call: McpCall,
  pubId: string,
  title: string
): Promise<string | null> {
  const res = asObj(await call("list_posts", { publication_id: pubId, status: "draft", per_page: 100 }));
  const posts = Array.isArray(res.posts) ? (res.posts as unknown[]) : [];
  const want = title.trim().toLowerCase();
  for (const p of posts) {
    const post = asObj(p);
    if (asStr(post.title).trim().toLowerCase() === want) {
      const id = asStr(post.id);
      if (id) return id;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// REST fallback path
// ---------------------------------------------------------------------------

async function beehiivWrite(
  method: "POST" | "PUT",
  path: string,
  payload: Record<string, unknown>
): Promise<{ id: string; title: string; status: string; web_url: string }> {
  const apiKey = process.env.BEEHIIV_API_KEY;
  const pubId = process.env.BEEHIIV_PUBLICATION_ID;
  if (!apiKey || !pubId) throw new Error("BEEHIIV_API_KEY and BEEHIIV_PUBLICATION_ID are required");

  const res = await fetch(`${BEEHIIV_API_BASE}${path.replace("{pubId}", pubId)}`, {
    method,
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const msg = (body.errors as { message: string }[])?.[0]?.message ?? body.message ?? `HTTP ${res.status}`;
    throw new Error(`Beehiiv API error: ${msg}`);
  }
  const json = (await res.json()) as { data: Record<string, unknown> };
  const data = asObj(json.data);
  return {
    id: asStr(data.id),
    title: asStr(data.title),
    status: asStr(data.status) || "draft",
    web_url: asStr(data.web_url),
  };
}

function restPayload(params: BeehiivWriteParams): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    title: params.title,
    body_content: params.htmlContent,
    status: "draft",
  };
  if (params.subtitle) payload.subtitle = params.subtitle;
  if (params.previewText) payload.preview_text = params.previewText;
  if (params.seo) payload.seo_settings = params.seo;
  return payload;
}

// ---------------------------------------------------------------------------
// Public entry point: create-once, edit-many.
// ---------------------------------------------------------------------------

/**
 * Publish (create or update) a Beehiiv DRAFT post. Never schedules or sends.
 *
 * Resolution order for "create vs update":
 *   1. If `existingPostId` is provided, UPDATE that post.
 *   2. Else (MCP only) reconcile by title via list_posts; if a matching draft is
 *      found, UPDATE it (avoids creating a duplicate after a stored id is lost).
 *   3. Else CREATE a new draft.
 */
export async function publishBeehiivPost(
  params: BeehiivWriteParams,
  opts: { existingPostId?: string | null; ctx?: IntegrationToolContext } = {}
): Promise<BeehiivPublishOutcome> {
  if (!isBeehiivEnabled()) {
    throw new Error(
      "Beehiiv integration is not enabled. Set BEEHIIV_ENABLED=true with valid API credentials."
    );
  }

  const resolved = await resolveBeehiivMcp(opts.ctx);

  // ---- MCP path -----------------------------------------------------------
  if (resolved) {
    return withMcp(resolved.config, async (call) => {
      let targetId = opts.existingPostId?.trim() || null;
      if (!targetId) {
        targetId = await findDraftIdByTitleMcp(call, resolved.pubId, params.title);
      }
      if (targetId) {
        const result = await updateViaMcp(call, resolved.pubId, targetId, params);
        return { ...result, action: "update", transport: "mcp" };
      }
      const result = await createViaMcp(call, resolved.pubId, params);
      return { ...result, action: "create", transport: "mcp" };
    });
  }

  // ---- REST fallback ------------------------------------------------------
  const targetId = opts.existingPostId?.trim() || null;
  if (targetId) {
    const result = await beehiivWrite("PUT", `/publications/{pubId}/posts/${targetId}`, restPayload(params));
    return { ...result, id: result.id || targetId, action: "update", transport: "rest" };
  }
  const result = await beehiivWrite("POST", "/publications/{pubId}/posts", restPayload(params));
  return { ...result, action: "create", transport: "rest" };
}
