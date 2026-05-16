import { NextResponse } from "next/server";
import { validateCreatorBrandProfilePayload } from "@/lib/brand-profile/creatorBrandProfile";
import { requireWorkspace } from "@/lib/auth/session";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = validateCreatorBrandProfilePayload(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.errors.join("; ") }, { status: 400 });
  }

  const ctx = await requireWorkspace();
  if (ctx instanceof Response) return ctx;
  const { supabase, workspaceId } = ctx;

  const v = parsed.value;

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
