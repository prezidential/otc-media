import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/auth/session";

export async function GET() {
  const ctx = await requireWorkspace();
  if (ctx instanceof Response) return ctx;
  const { supabase, workspaceId } = ctx;

  const { data, error } = await supabase
    .from("brand_profiles")
    .select("id,name,created_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let defaultBrandProfileId: string | null = null;
  const ws = await supabase
    .from("workspace_settings")
    .select("default_brand_profile_id")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (!ws.error && ws.data && typeof ws.data.default_brand_profile_id === "string") {
    defaultBrandProfileId = ws.data.default_brand_profile_id;
  }

  return NextResponse.json({
    brandProfiles: data ?? [],
    defaultBrandProfileId,
  });
}
