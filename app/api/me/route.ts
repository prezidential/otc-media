import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseUser } from "@/lib/supabase/server";
import { ACTIVE_WORKSPACE_COOKIE } from "@/lib/auth/session";

/**
 * Returns the current user, every workspace they belong to, and which one is
 * currently "active". Used by the sidebar / workspace switcher.
 *
 * Shape:
 *   { user: { id, email } | null,
 *     workspaces: Array<{ id, slug, name, role, onboarding_completed_at }>,
 *     activeWorkspaceId: string | null }
 *
 * Returns 200 with `user: null` when unauthenticated so client-side checks don't
 * have to special-case 401s.
 */
export async function GET() {
  const supabase = await supabaseUser();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user ?? null;

  if (!user) {
    return NextResponse.json({ user: null, workspaces: [], activeWorkspaceId: null });
  }

  const { data: rows, error } = await supabase
    .from("workspace_members")
    .select(
      "role, workspace:workspaces!inner(id, slug, name, onboarding_completed_at)"
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  type Row = {
    role: string;
    workspace: {
      id: string;
      slug: string;
      name: string;
      onboarding_completed_at: string | null;
    };
  };
  const workspaces = ((rows ?? []) as unknown as Row[]).map((r) => ({
    id: r.workspace.id,
    slug: r.workspace.slug,
    name: r.workspace.name,
    role: r.role,
    onboarding_completed_at: r.workspace.onboarding_completed_at,
  }));

  const cookieStore = await cookies();
  const cookieActive = cookieStore.get(ACTIVE_WORKSPACE_COOKIE)?.value ?? null;
  const activeWorkspaceId =
    (cookieActive && workspaces.find((w) => w.id === cookieActive)?.id) ||
    workspaces[0]?.id ||
    null;

  return NextResponse.json({
    user: { id: user.id, email: user.email ?? null },
    workspaces,
    activeWorkspaceId,
  });
}
