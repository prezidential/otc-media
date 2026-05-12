import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { supabaseUser, supabaseAdmin } from "@/lib/supabase/server";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/workspaces/:id/members  { email, role? }
 *   Owner-only. Creates a `workspace_invites` row keyed by an opaque token and
 *   returns the join URL. Email delivery is intentionally out-of-scope for M0;
 *   the owner copies the link manually.
 *
 * RLS on workspace_invites already requires owner role, so the membership check
 * is enforced by Postgres rather than by this handler.
 */
export async function POST(req: NextRequest, { params }: Ctx) {
  const { id: workspaceId } = await params;

  const supabase = await supabaseUser();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: { email?: string; role?: string };
  try {
    body = (await req.json()) as { email?: string; role?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const email = (body.email ?? "").trim().toLowerCase();
  const role = (body.role ?? "editor") as "owner" | "editor" | "viewer";
  if (!email || !/.+@.+\..+/.test(email)) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }
  if (!["owner", "editor", "viewer"].includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  const token = randomBytes(24).toString("base64url");

  const { data: invite, error } = await supabase
    .from("workspace_invites")
    .insert({
      workspace_id: workspaceId,
      email,
      role,
      token,
      invited_by: userData.user.id,
    })
    .select("id, email, role, token, expires_at")
    .single();

  if (error || !invite) {
    return NextResponse.json(
      { error: error?.message ?? "Failed to create invite" },
      { status: error?.code === "42501" ? 403 : 500 }
    );
  }

  const origin =
    req.headers.get("origin") ||
    `${req.nextUrl.protocol}//${req.nextUrl.host}`;
  const url = `${origin}/api/workspaces/invites/${invite.token}`;

  return NextResponse.json({ invite, url }, { status: 201 });
}

/**
 * GET /api/workspaces/:id/members — list members + pending invites for the workspace.
 * RLS-gated: only members of the workspace can read either table.
 */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id: workspaceId } = await params;

  const supabase = await supabaseUser();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const [membersRes, invitesRes] = await Promise.all([
    supabase
      .from("workspace_members")
      .select("user_id, role, created_at")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: true }),
    supabase
      .from("workspace_invites")
      .select("id, email, role, token, expires_at, accepted_at, created_at")
      .eq("workspace_id", workspaceId)
      .is("accepted_at", null)
      .order("created_at", { ascending: false }),
  ]);

  if (membersRes.error) {
    return NextResponse.json({ error: membersRes.error.message }, { status: 500 });
  }

  // Fetch emails for the listed user_ids via service role (auth.users isn't
  // exposed to the `authenticated` role).
  const userIds = (membersRes.data ?? []).map((m) => m.user_id as string);
  let emailByUserId: Record<string, string | null> = {};
  if (userIds.length) {
    const admin = supabaseAdmin();
    const { data: usersList } = await admin.auth.admin.listUsers({ perPage: 200 });
    emailByUserId = Object.fromEntries(
      (usersList?.users ?? [])
        .filter((u) => userIds.includes(u.id))
        .map((u) => [u.id, u.email ?? null])
    );
  }

  const members = (membersRes.data ?? []).map((m) => ({
    userId: m.user_id as string,
    email: emailByUserId[m.user_id as string] ?? null,
    role: m.role as string,
    createdAt: m.created_at as string,
  }));

  return NextResponse.json({
    members,
    invites: invitesRes.data ?? [],
  });
}

/**
 * DELETE /api/workspaces/:id/members?userId=...
 *   Owner-only (enforced by RLS). Cannot remove yourself if you're the last owner.
 */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const { id: workspaceId } = await params;
  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ error: "userId required" }, { status: 400 });
  }

  const supabase = await supabaseUser();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Refuse to remove the last owner.
  const { data: owners } = await supabase
    .from("workspace_members")
    .select("user_id")
    .eq("workspace_id", workspaceId)
    .eq("role", "owner");
  if (
    (owners ?? []).length <= 1 &&
    (owners ?? [])[0]?.user_id === userId
  ) {
    return NextResponse.json(
      { error: "Cannot remove the last owner" },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .from("workspace_members")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId);
  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: error.code === "42501" ? 403 : 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
