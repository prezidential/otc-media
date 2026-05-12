import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { supabaseUser, supabaseAdmin } from "@/lib/supabase/server";
import { ACTIVE_WORKSPACE_COOKIE } from "@/lib/auth/session";

type Ctx = { params: Promise<{ token: string }> };

/**
 * GET /api/workspaces/invites/:token
 *   Public landing for an invite link. If the user isn't signed in, redirect to
 *   /sign-in?next=<this-url>. If they are, accept the invite and redirect to /.
 *
 * The invite is read with the service-role client (it's a public token, the user
 * may not be a member yet so RLS would forbid it). Membership is then created
 * under service-role and tied to the verified `auth.uid()` from the user's JWT.
 */
export async function GET(req: NextRequest, { params }: Ctx) {
  const { token } = await params;
  const url = req.nextUrl.clone();

  const supabase = await supabaseUser();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) {
    const signIn = req.nextUrl.clone();
    signIn.pathname = "/sign-in";
    signIn.searchParams.set("next", url.pathname);
    return NextResponse.redirect(signIn);
  }

  const admin = supabaseAdmin();
  const { data: invite } = await admin
    .from("workspace_invites")
    .select("id, workspace_id, email, role, expires_at, accepted_at")
    .eq("token", token)
    .maybeSingle();

  if (!invite) {
    return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  }
  if (invite.accepted_at) {
    return NextResponse.json({ error: "Invite already used" }, { status: 410 });
  }
  if (new Date(invite.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: "Invite expired" }, { status: 410 });
  }
  if (
    invite.email &&
    userData.user.email &&
    invite.email.toLowerCase() !== userData.user.email.toLowerCase()
  ) {
    return NextResponse.json(
      { error: `Invite is for ${invite.email}, but you're signed in as ${userData.user.email}.` },
      { status: 403 }
    );
  }

  const { error: memErr } = await admin
    .from("workspace_members")
    .upsert(
      {
        workspace_id: invite.workspace_id,
        user_id: userData.user.id,
        role: invite.role,
      },
      { onConflict: "workspace_id,user_id" }
    );
  if (memErr) {
    return NextResponse.json({ error: memErr.message }, { status: 500 });
  }

  await admin
    .from("workspace_invites")
    .update({ accepted_at: new Date().toISOString() })
    .eq("id", invite.id);

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_WORKSPACE_COOKIE, invite.workspace_id as string, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  const home = req.nextUrl.clone();
  home.pathname = "/";
  home.search = "";
  return NextResponse.redirect(home);
}
