import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { DEFAULT_LANES } from "@/lib/content-lanes/seed";

export async function POST() {
  const workspaceId = process.env.WORKSPACE_ID;
  if (!workspaceId) {
    return NextResponse.json({ error: "WORKSPACE_ID not configured" }, { status: 500 });
  }

  const supabase = supabaseAdmin();
  const created: string[] = [];
  const skipped: string[] = [];

  for (const lane of DEFAULT_LANES) {
    const { data: existing } = await supabase
      .from("content_lanes")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("slug", lane.slug)
      .maybeSingle();

    if (existing) {
      skipped.push(lane.slug);
      continue;
    }

    const { error } = await supabase.from("content_lanes").insert({
      workspace_id: workspaceId,
      name: lane.name,
      slug: lane.slug,
      description: lane.description,
      audience: lane.audience,
      voice_guidance: lane.voice_guidance,
      topics: lane.topics,
      ring: lane.ring,
      target_frequency_per_month: lane.target_frequency_per_month,
      is_active: true,
    });

    if (error) {
      return NextResponse.json({ error: error.message, created, skipped }, { status: 500 });
    }
    created.push(lane.slug);
  }

  return NextResponse.json({ ok: true, created, skipped });
}
