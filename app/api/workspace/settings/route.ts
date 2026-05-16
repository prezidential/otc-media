import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/auth/session";

export async function GET() {
  const ctx = await requireWorkspace();
  if (ctx instanceof Response) return ctx;
  const { supabase, workspaceId } = ctx;

  const { data, error } = await supabase
    .from("workspace_settings")
    .select("default_brand_profile_id, updated_at")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const defaultBrandProfileId =
    data && typeof data.default_brand_profile_id === "string" ? data.default_brand_profile_id : null;

  return NextResponse.json({
    defaultBrandProfileId,
    updated_at: data?.updated_at ?? null,
  });
}

export async function PATCH(req: Request) {
  const body = await req.json().catch(() => ({}));
  const raw = body.defaultBrandProfileId;
  const defaultBrandProfileId =
    raw === null || raw === ""
      ? null
      : typeof raw === "string" && raw.trim()
        ? raw.trim()
        : undefined;

  if (defaultBrandProfileId === undefined) {
    return NextResponse.json(
      { error: "defaultBrandProfileId must be a non-empty string or null" },
      { status: 400 }
    );
  }

  const ctx = await requireWorkspace();
  if (ctx instanceof Response) return ctx;
  const { supabase, workspaceId } = ctx;

  if (defaultBrandProfileId) {
    const { data: bp, error: bpErr } = await supabase
      .from("brand_profiles")
      .select("id")
      .eq("id", defaultBrandProfileId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();

    if (bpErr) return NextResponse.json({ error: bpErr.message }, { status: 500 });
    if (!bp) {
      return NextResponse.json({ error: "Brand profile not found in this workspace" }, { status: 404 });
    }
  }

  const now = new Date().toISOString();
  const { error: upsertErr } = await supabase.from("workspace_settings").upsert(
    {
      workspace_id: workspaceId,
      default_brand_profile_id: defaultBrandProfileId,
      updated_at: now,
    },
    { onConflict: "workspace_id" }
  );

  if (upsertErr) {
    return NextResponse.json({ error: upsertErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, defaultBrandProfileId });
}
