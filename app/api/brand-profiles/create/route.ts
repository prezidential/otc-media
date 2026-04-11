import { NextResponse } from "next/server";
import { validateCreatorBrandProfilePayload } from "@/lib/brand-profile/creatorBrandProfile";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const workspaceId = process.env.WORKSPACE_ID?.trim();
  if (!workspaceId) {
    return NextResponse.json({ error: "WORKSPACE_ID is not set" }, { status: 503 });
  }

  const body = await req.json().catch(() => null);
  const parsed = validateCreatorBrandProfilePayload(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.errors.join("; ") }, { status: 400 });
  }

  const v = parsed.value;
  const supabase = supabaseAdmin();

  const insertRow: Record<string, unknown> = {
    workspace_id: workspaceId,
    name: v.name,
    voice_rules_json: v.voice_rules_json,
    formatting_rules_json: v.formatting_rules_json,
    forbidden_patterns_json: v.forbidden_patterns_json,
    cta_rules_json: v.cta_rules_json,
    emoji_policy_json: v.emoji_policy_json,
    narrative_preferences_json: v.narrative_preferences_json,
    profile_version: v.profile_version ?? "1.0",
  };
  if (v.elevenlabs_voice_id != null) insertRow.elevenlabs_voice_id = v.elevenlabs_voice_id;
  if (v.elevenlabs_model_id != null) insertRow.elevenlabs_model_id = v.elevenlabs_model_id;

  const { data, error } = await supabase.from("brand_profiles").insert(insertRow).select("id").single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: data?.id as string });
}
