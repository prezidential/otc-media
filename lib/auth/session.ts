import { cookies } from "next/headers";
import { supabaseUser } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Cookie name for the active workspace selection. Read on every request. */
export const ACTIVE_WORKSPACE_COOKIE = "cs_active_workspace";

export type WorkspaceRole = "owner" | "editor" | "viewer";

export type WorkspaceContext = {
  userId: string;
  workspaceId: string;
  role: WorkspaceRole;
  supabase: SupabaseClient;
};

export class AuthError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/**
 * Resolve the active workspace context for the current request.
 *
 * Throws `AuthError` with:
 *   - 401 when the user is not authenticated.
 *   - 403 when the user is authenticated but has no workspaces, or has an active
 *     workspace cookie pointing at a workspace they no longer belong to.
 *
 * Active workspace selection rule:
 *   1. If the `cs_active_workspace` cookie is set AND the user is a member, use it.
 *   2. Otherwise pick the first membership ordered by created_at and persist it.
 *
 * Always returns a `supabase` client bound to the same request cookies, so callers
 * don't need to re-create it.
 */
export async function getWorkspaceContext(): Promise<WorkspaceContext> {
  const supabase = await supabaseUser();

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) {
    throw new AuthError("Not authenticated", 401);
  }
  const userId = userData.user.id;

  const { data: memberships, error: memErr } = await supabase
    .from("workspace_members")
    .select("workspace_id, role, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (memErr) {
    throw new AuthError(`Failed to load workspace memberships: ${memErr.message}`, 500);
  }
  if (!memberships || memberships.length === 0) {
    throw new AuthError("No workspaces", 403);
  }

  const cookieStore = await cookies();
  const activeCookie = cookieStore.get(ACTIVE_WORKSPACE_COOKIE)?.value ?? null;

  const chosen =
    (activeCookie && memberships.find((m) => m.workspace_id === activeCookie)) ||
    memberships[0];

  return {
    userId,
    workspaceId: chosen.workspace_id as string,
    role: chosen.role as WorkspaceRole,
    supabase,
  };
}

/**
 * Variant of `getWorkspaceContext` that returns `null` instead of throwing on 401/403.
 * Useful for endpoints (like `/api/me`) that need to render a partial response for
 * unauthenticated callers.
 */
export async function tryGetWorkspaceContext(): Promise<WorkspaceContext | null> {
  try {
    return await getWorkspaceContext();
  } catch (err) {
    if (err instanceof AuthError && (err.status === 401 || err.status === 403)) {
      return null;
    }
    throw err;
  }
}

/**
 * Helper for route handlers: turns an `AuthError` into a `NextResponse`-compatible
 * `{ body, status }` tuple. Routes do `if (ctx instanceof Response) return ctx;`.
 */
export async function requireWorkspace(): Promise<WorkspaceContext | Response> {
  try {
    return await getWorkspaceContext();
  } catch (err) {
    if (err instanceof AuthError) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: err.status,
        headers: { "Content-Type": "application/json" },
      });
    }
    throw err;
  }
}
