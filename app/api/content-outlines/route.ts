import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { dbRowToApiOutline } from "@/lib/content-outlines/api-serialize";
import { collectOutlineSpecWarnings, formFieldsToSpecJson, validateOutlineFormBody } from "@/lib/content-outlines/spec-form";

async function clearDefaultsForKind(
  supabase: ReturnType<typeof supabaseAdmin>,
  workspaceId: string,
  kind: string
) {
  await supabase.from("content_outlines").update({ is_default: false }).eq("workspace_id", workspaceId).eq("kind", kind);
}

export async function GET(req: Request) {
  const workspaceId = process.env.WORKSPACE_ID!;
  const supabase = supabaseAdmin();
  const { searchParams } = new URL(req.url);
  const includeDisabled = searchParams.get("includeDisabled") === "1";

  let q = supabase
    .from("content_outlines")
    .select("id,name,kind,is_default,disabled_at,created_at,updated_at,spec_json")
    .eq("workspace_id", workspaceId)
    .order("kind", { ascending: true })
    .order("name", { ascending: true });

  if (!includeDisabled) {
    q = q.is("disabled_at", null);
  }

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const outlines = (data ?? []).map((row) => dbRowToApiOutline(row));
  return NextResponse.json({ outlines });
}

export async function POST(req: Request) {
  const workspaceId = process.env.WORKSPACE_ID!;
  const supabase = supabaseAdmin();
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;

  const parsed = validateOutlineFormBody(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const fields = parsed.fields;
  const specJson = formFieldsToSpecJson(fields);
  const warnings = collectOutlineSpecWarnings(fields.kind, specJson);

  if (fields.is_default) {
    await clearDefaultsForKind(supabase, workspaceId, fields.kind);
  }

  const { data: inserted, error: insertError } = await supabase
    .from("content_outlines")
    .insert({
      workspace_id: workspaceId,
      name: fields.name,
      kind: fields.kind,
      spec_json: specJson,
      is_default: fields.is_default,
      disabled_at: null,
    })
    .select("id,name,kind,is_default,disabled_at,created_at,updated_at,spec_json")
    .single();

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
  if (!inserted) return NextResponse.json({ error: "Insert failed" }, { status: 500 });

  return NextResponse.json({
    outline: dbRowToApiOutline(inserted),
    warnings,
  });
}
