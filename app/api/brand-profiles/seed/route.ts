import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/auth/session";
import {
  TEMPLATES,
  getTemplate,
  isTemplateId,
  type TemplateId,
} from "@/lib/brand-profile/templates";

/**
 * POST /api/brand-profiles/seed
 *
 * Body: `{ template?: "idj" | "blank", name?: string }`
 *   - `template` defaults to `"idj"` for backward compatibility with the legacy
 *     v2.0 seeder that hardcoded `DEFAULT_IDJ_PROFILE`.
 *   - `name` optionally overrides the template's default display name (used by
 *     the onboarding wizard to label the profile after the workspace).
 *
 * Behavior:
 *   - No-op (returns `{ inserted: 0 }`) when the workspace already has any
 *     brand profile. Same idempotency guarantee as before.
 *   - On insert, returns `{ inserted: 1, brandProfile: { id, name } }` so the
 *     wizard can immediately PATCH `workspace_settings.default_brand_profile_id`.
 *
 * Migration note (RLS wave-2): this route was previously the last brand-profiles
 * route still on `supabaseAdmin()` + `process.env.WORKSPACE_ID`. The M1.2 wizard
 * needs it to write into whatever workspace the caller just created, which
 * `WORKSPACE_ID` cannot represent. Now uses `requireWorkspace()` → `supabaseUser()`
 * and lets RLS (`brand_profiles_workspace_rw`, see `schema-rls-wave1.sql`)
 * enforce scoping.
 */
export async function POST(req: Request) {
  const ctx = await requireWorkspace();
  if (ctx instanceof Response) return ctx;
  const { supabase, workspaceId } = ctx;

  const body = (await req.json().catch(() => ({}))) as {
    template?: unknown;
    name?: unknown;
  };

  const requested = body?.template;
  const templateId: TemplateId =
    requested === undefined || requested === null
      ? "idj"
      : isTemplateId(requested)
        ? requested
        : ("__invalid__" as TemplateId);

  if (!(templateId in TEMPLATES)) {
    return NextResponse.json(
      {
        error: `Unknown template "${String(requested)}". Valid: ${Object.keys(TEMPLATES).join(", ")}`,
      },
      { status: 400 }
    );
  }

  const template = getTemplate(templateId);
  const overrideName =
    typeof body?.name === "string" && body.name.trim() ? body.name.trim() : null;

  const { data: existing, error: fetchError } = await supabase
    .from("brand_profiles")
    .select("id, name")
    .eq("workspace_id", workspaceId)
    .limit(1);

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }
  if (existing && existing.length > 0) {
    const row = existing[0] as { id: string; name: string };
    return NextResponse.json({
      inserted: 0,
      brandProfile: { id: row.id, name: row.name },
    });
  }

  const { data: inserted, error: insertError } = await supabase
    .from("brand_profiles")
    .insert({
      workspace_id: workspaceId,
      name: overrideName ?? template.name,
      voice_rules_json: template.voice_rules_json,
      formatting_rules_json: template.formatting_rules_json,
      forbidden_patterns_json: template.forbidden_patterns_json,
      cta_rules_json: template.cta_rules_json,
      emoji_policy_json: template.emoji_policy_json,
      narrative_preferences_json: template.narrative_preferences_json,
      profile_version: template.profile_version ?? "1.0",
    })
    .select("id, name")
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }
  return NextResponse.json({
    inserted: inserted ? 1 : 0,
    brandProfile: inserted
      ? { id: inserted.id as string, name: inserted.name as string }
      : null,
  });
}
