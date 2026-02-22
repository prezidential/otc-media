import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

const DEFAULT_ITEMS = [
  {
    type: "premium",
    title: "Identity Jedi Newsletter Premium",
    description: "Deeper editorial dives, premium frameworks, and early access content.",
    link: null as string | null,
    priority_score: 0.9,
    active: true,
    start_date: null as string | null,
    end_date: null as string | null,
  },
  {
    type: "product",
    title: "Workshop-in-a-Box",
    description: "A ready-to-run IAM workshop system built from real field deployments.",
    link: null as string | null,
    priority_score: 0.8,
    active: true,
    start_date: null as string | null,
    end_date: null as string | null,
  },
];

export async function POST() {
  const workspaceId = process.env.WORKSPACE_ID!;
  const supabase = supabaseAdmin();

  const { data: existing, error: fetchError } = await supabase
    .from("revenue_items")
    .select("id")
    .eq("workspace_id", workspaceId)
    .limit(1);

  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
  if (existing && existing.length > 0) return NextResponse.json({ inserted: 0 });

  const rows = DEFAULT_ITEMS.map((item) => {
    const row: any = {
      workspace_id: workspaceId,
      type: item.type,
      title: item.title,
      priority_score: item.priority_score,
      active: item.active,
    };
  
    if (item.description !== undefined) row.description = item.description;
    if (item.link !== undefined) row.link = item.link;
    if (item.start_date !== undefined) row.start_date = item.start_date;
    if (item.end_date !== undefined) row.end_date = item.end_date;
  
    return row;
  });

  const { data: inserted, error: insertError } = await supabase
    .from("revenue_items")
    .insert(rows)
    .select("id");

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
  return NextResponse.json({ inserted: inserted?.length ?? 0 });
}
