import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { dbRowToApiOutline } from "@/lib/content-outlines/api-serialize";
import {
  collectOutlineSpecWarnings,
  formFieldsToSpecJson,
  specJsonToFormFields,
  validateOutlineFormBody,
} from "@/lib/content-outlines/spec-form";
import type { OutlineKind } from "@/lib/content-outlines/types";

async function clearDefaultsForKind(
  supabase: ReturnType<typeof supabaseAdmin>,
  workspaceId: string,
  kind: string
) {
  await supabase.from("content_outlines").update({ is_default: false }).eq("workspace_id", workspaceId).eq("kind", kind);
}

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: RouteParams) {
  const { id } = await params;
  const workspaceId = process.env.WORKSPACE_ID!;
  const supabase = supabaseAdmin();

  const { data, error } = await supabase
    .from("content_outlines")
    .select("id,name,kind,is_default,disabled_at,created_at,updated_at,spec_json")
    .eq("workspace_id", workspaceId)
    .eq("id", id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ outline: dbRowToApiOutline(data) });
}

export async function PATCH(req: Request, { params }: RouteParams) {
  const { id } = await params;
  const workspaceId = process.env.WORKSPACE_ID!;
  const supabase = supabaseAdmin();
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;

  const { data: existing, error: fetchError } = await supabase
    .from("content_outlines")
    .select("id,name,kind,is_default,disabled_at,spec_json")
    .eq("workspace_id", workspaceId)
    .eq("id", id)
    .maybeSingle();

  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.disabled_at != null) {
    return NextResponse.json({ error: "Cannot edit a disabled outline." }, { status: 400 });
  }

  const kind = existing.kind as OutlineKind;
  const base = specJsonToFormFields(kind, existing.spec_json);
  base.name = existing.name;
  base.kind = kind;
  base.is_default = existing.is_default;

  if (typeof body.name === "string") base.name = body.name.trim();
  if (body.is_default === true || body.is_default === false) base.is_default = body.is_default;
  if (typeof body.userPromptTemplate === "string") base.userPromptTemplate = body.userPromptTemplate;
  if (typeof body.systemPromptSuffix === "string") base.systemPromptSuffix = body.systemPromptSuffix;
  if (typeof body.insiderSystemPrompt === "string") base.insiderSystemPrompt = body.insiderSystemPrompt;

  if (body.kind != null && body.kind !== kind) {
    return NextResponse.json({ error: "kind cannot be changed" }, { status: 400 });
  }

  const mergedBody: Record<string, unknown> = {
    name: base.name,
    kind: base.kind,
    is_default: base.is_default,
    userPromptTemplate: base.userPromptTemplate,
    systemPromptSuffix: base.systemPromptSuffix,
    insiderSystemPrompt: base.insiderSystemPrompt,
  };

  const parsed = validateOutlineFormBody(mergedBody);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const fields = parsed.fields;
  const specJson = formFieldsToSpecJson(fields);
  const warnings = collectOutlineSpecWarnings(fields.kind, specJson);

  if (fields.is_default) {
    await clearDefaultsForKind(supabase, workspaceId, fields.kind);
  }

  const { data: updated, error: updateError } = await supabase
    .from("content_outlines")
    .update({
      name: fields.name,
      spec_json: specJson,
      is_default: fields.is_default,
      updated_at: new Date().toISOString(),
    })
    .eq("workspace_id", workspaceId)
    .eq("id", id)
    .is("disabled_at", null)
    .select("id,name,kind,is_default,disabled_at,created_at,updated_at,spec_json")
    .single();

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  if (!updated) return NextResponse.json({ error: "Update failed" }, { status: 500 });

  return NextResponse.json({
    outline: dbRowToApiOutline(updated),
    warnings,
  });
}

export async function DELETE(_req: Request, { params }: RouteParams) {
  const { id } = await params;
  const workspaceId = process.env.WORKSPACE_ID!;
  const supabase = supabaseAdmin();

  const { data: existing, error: fetchError } = await supabase
    .from("content_outlines")
    .select("id,disabled_at")
    .eq("workspace_id", workspaceId)
    .eq("id", id)
    .maybeSingle();

  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.disabled_at != null) {
    return NextResponse.json({ error: "Outline is already disabled." }, { status: 400 });
  }

  const { error: updateError } = await supabase
    .from("content_outlines")
    .update({
      disabled_at: new Date().toISOString(),
      is_default: false,
      updated_at: new Date().toISOString(),
    })
    .eq("workspace_id", workspaceId)
    .eq("id", id);

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
