import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

const DEFAULT_DIRECTIVES = [
  { name: "Identity Vendor Moves", cadence: "daily", description: "Track identity vendor product updates, M&A, and strategy changes." },
  { name: "Non-Human Identity Incidents", cadence: "daily", description: "Monitor incidents and breaches involving non-human identities (bots, APIs, service accounts)." },
  { name: "Identity + AI", cadence: "daily", description: "Cover identity management and security in the context of AI and ML." },
  { name: "Identity Threat Detection", cadence: "daily", description: "Track identity-related attacks, credential theft, phishing campaigns, and ITDR developments." },
  { name: "Regulatory and Standards", cadence: "weekly", description: "Identity-related regulations, standards, and compliance updates." },
  { name: "IGA Modernization and Migration", cadence: "weekly", description: "Identity governance and administration modernization, migrations, and best practices." },
  { name: "CIEM and Cloud Identity", cadence: "weekly", description: "Cloud infrastructure entitlement management, cloud IAM, and multi-cloud identity posture." },
];

export async function POST() {
  const workspaceId = process.env.WORKSPACE_ID!;
  const supabase = supabaseAdmin();

  const { data: existing, error: fetchError } = await supabase
    .from("research_directives")
    .select("id")
    .eq("workspace_id", workspaceId)
    .limit(1);

  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
  if (existing && existing.length > 0) return NextResponse.json({ inserted: 0 });

  const rows = DEFAULT_DIRECTIVES.map((d) => ({
    workspace_id: workspaceId,
    name: d.name,
    cadence: d.cadence,
    description: d.description,
    query_templates_json: [],
    include_domains_json: [],
    exclude_domains_json: [],
  }));

  const { data: inserted, error: insertError } = await supabase
    .from("research_directives")
    .insert(rows)
    .select("id");

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
  return NextResponse.json({ inserted: inserted?.length ?? 0 });
}
