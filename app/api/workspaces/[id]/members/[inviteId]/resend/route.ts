import { NextResponse, type NextRequest } from "next/server";
import { supabaseUser } from "@/lib/supabase/server";
import { sendWorkspaceInvite } from "@/lib/email/resend";

type Ctx = { params: Promise<{ id: string; inviteId: string }> };

/**
 * POST /api/workspaces/:id/members/:inviteId/resend
 *
 * One-click "resend" for a pending workspace invite. Auth: standard
 * supabaseUser() + an explicit owner-role check on top of RLS. The
 * `workspace_invites_owner_write` policy already requires owner role for
 * inserts/updates, and SELECT requires membership; the owner check here is
 * defense in depth (and surfaces a 403 with a clear message instead of an
 * opaque empty result).
 */
export async function POST(req: NextRequest, { params }: Ctx) {
  const { id: workspaceId, inviteId } = await params;

  const supabase = await supabaseUser();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Explicit owner check (RLS would block writes anyway, but this gives a
  // clean 403 and avoids issuing the email lookup when the caller can't act).
  const { data: membership } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (!membership || membership.role !== "owner") {
    return NextResponse.json(
      { error: "Owner role required" },
      { status: 403 }
    );
  }

  const { data: invite, error: inviteErr } = await supabase
    .from("workspace_invites")
    .select("id, email, role, token, expires_at, accepted_at")
    .eq("workspace_id", workspaceId)
    .eq("id", inviteId)
    .is("accepted_at", null)
    .maybeSingle();
  if (inviteErr) {
    return NextResponse.json({ error: inviteErr.message }, { status: 500 });
  }
  if (!invite) {
    return NextResponse.json(
      { error: "Invite not found or already accepted" },
      { status: 404 }
    );
  }

  const origin =
    req.headers.get("origin") ||
    `${req.nextUrl.protocol}//${req.nextUrl.host}`;
  const url = `${origin}/api/workspaces/invites/${invite.token}`;

  const { data: workspaceRow } = await supabase
    .from("workspaces")
    .select("name")
    .eq("id", workspaceId)
    .single();
  const workspaceName = workspaceRow?.name ?? "your workspace";

  const emailResult = await sendWorkspaceInvite({
    to: invite.email as string,
    inviteUrl: url,
    workspaceName,
    inviterEmail: userData.user.email ?? null,
    role: invite.role as "owner" | "editor" | "viewer",
  });

  return NextResponse.json({
    email: {
      sent: emailResult.ok,
      error: emailResult.ok ? null : emailResult.error,
    },
  });
}
