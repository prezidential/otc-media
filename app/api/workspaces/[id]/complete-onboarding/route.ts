import { NextResponse, type NextRequest } from "next/server";
import { supabaseUser } from "@/lib/supabase/server";

type Ctx = { params: Promise<{ id: string }> };

/**
 * PATCH /api/workspaces/:id/complete-onboarding
 *
 * Stamps `workspaces.onboarding_completed_at = now()` for the given workspace.
 * Called by step 4 of the M1.2 onboarding wizard so subsequent visits to
 * `/onboarding` can decide to send the user straight to `/dashboard` and so the
 * `/api/me` payload reflects onboarding state across surfaces.
 *
 * Authorization: RLS-gated. The `workspaces_owner_write` policy
 * (`schema-tenancy.sql`) only allows updates when `user_is_workspace_owner(id)`
 * returns true, so a non-owner (or non-member) gets a zero-row update result
 * which this handler surfaces as 403. No explicit role check needed in code.
 */
export async function PATCH(_req: NextRequest, { params }: Ctx) {
  const { id: workspaceId } = await params;
  if (!workspaceId) {
    return NextResponse.json({ error: "workspaceId required" }, { status: 400 });
  }

  const supabase = await supabaseUser();
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("workspaces")
    .update({ onboarding_completed_at: now })
    .eq("id", workspaceId)
    .select("id, slug, name, onboarding_completed_at")
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: error.code === "42501" ? 403 : 500 }
    );
  }
  if (!data) {
    return NextResponse.json(
      { error: "Workspace not found or not permitted" },
      { status: 403 }
    );
  }

  return NextResponse.json({ ok: true, workspace: data });
}
