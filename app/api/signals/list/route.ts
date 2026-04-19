import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

function heatFromCapturedAt(capturedAt: string): number {
  const ageHours = (Date.now() - new Date(capturedAt).getTime()) / 3_600_000;
  const recency = Math.max(0, 100 - Math.min(100, ageHours * 1.5));
  return Math.min(100, Math.max(12, Math.round(35 + recency * 0.65)));
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const limit = Number(searchParams.get("limit") || "25");
  const includeHeat = searchParams.get("heat") === "1" || searchParams.get("includeHeat") === "true";

  const workspaceId = process.env.WORKSPACE_ID!;
  const supabase = supabaseAdmin();

  const { data, error } = await supabase
    .from("signals")
    .select("id,title,publisher,url,published_at,captured_at")
    .eq("workspace_id", workspaceId)
    .order("captured_at", { ascending: false })
    .limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const rows = data || [];
  if (!includeHeat) {
    return NextResponse.json({ signals: rows });
  }
  const signals = rows.map((s) => ({
    ...s,
    heat: heatFromCapturedAt(s.captured_at as string),
  }));
  return NextResponse.json({ signals });
}
