import { NextResponse } from "next/server";
import {
  serializeBrandProfileForApi,
  type CreatorBrandProfileRow,
  validateCreatorBrandProfilePayload,
} from "@/lib/brand-profile/creatorBrandProfile";
import { requireWorkspace } from "@/lib/auth/session";

const SELECT_FULL =
  "id,workspace_id,name,voice_rules_json,formatting_rules_json,forbidden_patterns_json,cta_rules_json,emoji_policy_json,narrative_preferences_json,profile_version,elevenlabs_voice_id,elevenlabs_model_id,created_at";

export async function GET(_req: Request, routeCtx: { params: Promise<{ id: string }> }) {
  const { id } = await routeCtx.params;
  if (!id?.trim()) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const ctx = await requireWorkspace();
  if (ctx instanceof Response) return ctx;
  const { supabase, workspaceId } = ctx;

  const { data, error } = await supabase
    .from("brand_profiles")
    .select(SELECT_FULL)
    .eq("id", id.trim())
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ profile: serializeBrandProfileForApi(data as CreatorBrandProfileRow) });
}

export async function PATCH(req: Request, routeCtx: { params: Promise<{ id: string }> }) {
  const { id } = await routeCtx.params;
  if (!id?.trim()) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const parsed = validateCreatorBrandProfilePayload(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.errors.join("; ") }, { status: 400 });
  }

  const v = parsed.value;
  const ctx = await requireWorkspace();
  if (ctx instanceof Response) return ctx;
  const { supabase, workspaceId } = ctx;

  const updateRow: Record<string, unknown> = {
    name: v.name,
    voice_rules_json: v.voice_rules_json,
    formatting_rules_json: v.formatting_rules_json,
    forbidden_patterns_json: v.forbidden_patterns_json,
    cta_rules_json: v.cta_rules_json,
    emoji_policy_json: v.emoji_policy_json,
    narrative_preferences_json: v.narrative_preferences_json,
    profile_version: v.profile_version ?? "1.0",
    elevenlabs_voice_id: v.elevenlabs_voice_id,
    elevenlabs_model_id: v.elevenlabs_model_id,
  };

  const { data, error } = await supabase
    .from("brand_profiles")
    .update(updateRow)
    .eq("id", id.trim())
    .eq("workspace_id", workspaceId)
    .select(SELECT_FULL)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ ok: true, profile: serializeBrandProfileForApi(data as CreatorBrandProfileRow) });
}
