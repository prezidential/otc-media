import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { supabaseUser, supabaseAdmin } from "@/lib/supabase/server";
import { ACTIVE_WORKSPACE_COOKIE } from "@/lib/auth/session";

/**
 * POST /api/workspaces  { slug, name }
 *   Creates a workspace and adds the caller as the owner. Sets the active
 *   workspace cookie to the new id.
 *
 * Why supabaseAdmin: the just-authenticated user has zero memberships, so the
 * `workspaces_member_read` RLS policy would forbid the insert from `authenticated`.
 * Workspace creation is a system bootstrap. Both rows (workspaces + the owner
 * membership) are inserted under service-role and explicitly tied to the verified
 * `auth.uid()` we read from the user's JWT.
 */
export async function POST(req: NextRequest) {
  const supabase = await supabaseUser();
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const userId = userData.user.id;

  let body: { slug?: string; name?: string };
  try {
    body = (await req.json()) as { slug?: string; name?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const slug = (body.slug ?? "").trim().toLowerCase();
  const name = (body.name ?? "").trim();
  if (!slug || !/^[a-z0-9][a-z0-9-]{1,40}$/.test(slug)) {
    return NextResponse.json(
      { error: "Slug must be 2–41 chars: lowercase letters, digits, hyphens." },
      { status: 400 }
    );
  }
  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const admin = supabaseAdmin();

  const { data: existing } = await admin
    .from("workspaces")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ error: "Slug already taken" }, { status: 409 });
  }

  const { data: ws, error: insErr } = await admin
    .from("workspaces")
    .insert({ slug, name })
    .select("id, slug, name, onboarding_completed_at")
    .single();
  if (insErr || !ws) {
    return NextResponse.json(
      { error: insErr?.message ?? "Failed to create workspace" },
      { status: 500 }
    );
  }

  const { error: memErr } = await admin
    .from("workspace_members")
    .insert({ workspace_id: ws.id, user_id: userId, role: "owner" });
  if (memErr) {
    return NextResponse.json({ error: memErr.message }, { status: 500 });
  }

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_WORKSPACE_COOKIE, ws.id as string, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  return NextResponse.json({ workspace: ws }, { status: 201 });
}
