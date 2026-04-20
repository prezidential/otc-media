import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { supabaseUser } from "@/lib/supabase/server";
import { ACTIVE_WORKSPACE_COOKIE } from "@/lib/auth/session";

/**
 * POST /api/workspaces/active  { workspaceId }
 *   Sets the active-workspace cookie. The user must be a member of the target
 *   workspace; the membership lookup runs under RLS so non-members get a clean 403.
 */
export async function POST(req: NextRequest) {
  const supabase = await supabaseUser();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: { workspaceId?: string };
  try {
    body = (await req.json()) as { workspaceId?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const workspaceId = (body.workspaceId ?? "").trim();
  if (!workspaceId) {
    return NextResponse.json({ error: "workspaceId required" }, { status: 400 });
  }

  const { data: membership, error } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!membership) {
    return NextResponse.json({ error: "Not a member of that workspace" }, { status: 403 });
  }

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_WORKSPACE_COOKIE, workspaceId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  return NextResponse.json({ ok: true, workspaceId });
}
