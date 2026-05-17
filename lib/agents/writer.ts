import { supabaseAdmin } from "@/lib/supabase/server";
import { callLLM } from "@/lib/llm/provider";
import { LeadsOutputSchema } from "@/lib/leads/leadSchema";
import { type AgentDefinition, type AgentTool } from "./framework";

function createWriterTools(workspaceId: string, brandProfileId: string): AgentTool[] {
  return [
    {
      name: "query_fresh_signals",
      description: "Get recent signals from the last 14 days. Returns two groups: directive_groups (old pipeline, signals tied to a research directive) and source_groups (new pipeline, signals from approved research sources without a directive). Both can be used to generate leads.",
      execute: async () => {
        const supabase = supabaseAdmin();
        const since = new Date();
        since.setDate(since.getDate() - 14);

        const { data: signals } = await supabase
          .from("signals")
          .select("id, directive_id, title, url, publisher")
          .eq("workspace_id", workspaceId)
          .gte("captured_at", since.toISOString())
          .order("captured_at", { ascending: false });

        // --- Directive groups (old pipeline) ---
        const byDirective = new Map<string, { count: number; titles: string[] }>();
        for (const s of signals ?? []) {
          if (!s.directive_id) continue;
          const key = s.directive_id;
          if (!byDirective.has(key)) byDirective.set(key, { count: 0, titles: [] });
          const entry = byDirective.get(key)!;
          entry.count++;
          if (entry.titles.length < 5) entry.titles.push(s.title ?? "");
        }

        const { data: directives } = await supabase
          .from("research_directives")
          .select("id, name")
          .eq("workspace_id", workspaceId);

        const directiveNames = new Map((directives ?? []).map((d) => [d.id, d.name]));

        const directive_groups = [...byDirective.entries()].map(([id, info]) => ({
          directive_id: id,
          directive_name: directiveNames.get(id) ?? "Unknown",
          signal_count: info.count,
          sample_titles: info.titles,
        }));

        // --- Source groups (new pipeline: no directive_id) ---
        const byPublisher = new Map<string, { count: number; titles: string[] }>();
        for (const s of signals ?? []) {
          if (s.directive_id) continue;
          const key = s.publisher ?? "Unknown";
          if (!byPublisher.has(key)) byPublisher.set(key, { count: 0, titles: [] });
          const entry = byPublisher.get(key)!;
          entry.count++;
          if (entry.titles.length < 5) entry.titles.push(s.title ?? "");
        }

        const source_groups = [...byPublisher.entries()].map(([publisher, info]) => ({
          publisher,
          signal_count: info.count,
          sample_titles: info.titles,
        }));

        return {
          total_signals: signals?.length ?? 0,
          directive_groups,
          source_groups,
        };
      },
    },
    {
      name: "check_existing_leads",
      description: "Check how many pending and approved leads already exist. Helps decide whether to generate more.",
      execute: async () => {
        const supabase = supabaseAdmin();
        const { data: leads } = await supabase
          .from("editorial_leads")
          .select("angle, status")
          .eq("workspace_id", workspaceId)
          .in("status", ["pending_review", "approved"]);

        const pending = (leads ?? []).filter((l) => l.status === "pending_review").length;
        const approved = (leads ?? []).filter((l) => l.status === "approved").length;

        return { pending_review: pending, approved, total_active: pending + approved };
      },
    },
    {
      name: "generate_leads_for_directive",
      description: "Generate editorial leads from signals for a specific research directive (old pipeline). Provide directive_id and directive_name.",
      execute: async (params) => {
        const directiveId = params.directive_id as string;
        const directiveName = params.directive_name as string;
        if (!directiveId || !directiveName) return { error: "directive_id and directive_name required" };

        const supabase = supabaseAdmin();
        const since = new Date();
        since.setDate(since.getDate() - 14);

        const { data: signals } = await supabase
          .from("signals")
          .select("title, url, publisher")
          .eq("workspace_id", workspaceId)
          .eq("directive_id", directiveId)
          .gte("captured_at", since.toISOString())
          .order("captured_at", { ascending: false })
          .limit(12);

        if (!signals || signals.length === 0) return { directive: directiveName, inserted: 0, note: "No recent signals" };

        return await generateLeadsFromSignals(supabase, workspaceId, brandProfileId, directiveName, signals);
      },
    },
    {
      name: "generate_leads_for_source",
      description: "Generate editorial leads from signals ingested via the new research sources pipeline (no directive). Provide publisher to scope to one source, or omit to use all undirected signals together.",
      execute: async (params) => {
        const publisher = params.publisher as string | undefined;
        const groupName = publisher ?? "Curated Research Sources";

        const supabase = supabaseAdmin();
        const since = new Date();
        since.setDate(since.getDate() - 14);

        let query = supabase
          .from("signals")
          .select("title, url, publisher")
          .eq("workspace_id", workspaceId)
          .is("directive_id", null)
          .gte("captured_at", since.toISOString())
          .order("captured_at", { ascending: false })
          .limit(12);

        if (publisher) {
          query = query.eq("publisher", publisher);
        }

        const { data: signals } = await query;

        if (!signals || signals.length === 0) return { source: groupName, inserted: 0, note: "No recent signals" };

        return await generateLeadsFromSignals(supabase, workspaceId, brandProfileId, groupName, signals);
      },
    },
  ];
}

async function generateLeadsFromSignals(
  supabase: ReturnType<typeof supabaseAdmin>,
  workspaceId: string,
  brandProfileId: string,
  groupName: string,
  signals: { title: string | null; url: string | null; publisher: string | null }[]
) {
  const { data: brandProfile } = await supabase
    .from("brand_profiles")
    .select("name, voice_rules_json, formatting_rules_json, forbidden_patterns_json")
    .eq("id", brandProfileId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  const systemPrompt = `You respond only with valid JSON. No code fences, no commentary.\nBrand: ${brandProfile?.name ?? "Default"}`;
  const signalsText = signals.map((s) => `- title: ${s.title}\n  url: ${s.url}\n  publisher: ${s.publisher}`).join("\n");
  const allowedUrls = new Set(signals.map((s) => s.url).filter(Boolean) as string[]);

  const userPrompt = `You are an editorial lead generator. Use ONLY the following signals. Every citation URL must be from the list below.

Signals:
${signalsText}

Return JSON: {"directive":"${groupName}","leads":[{"angle":"...","why_now":"...","who_it_impacts":"...","contrarian_take":"...","confidence":0.7,"sources":["url"]}]}
Produce 2-4 leads.`;

  const response = await callLLM("leads", [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ], { max_tokens: 4096 });

  let parsed: unknown;
  try {
    const raw = response.text.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
    parsed = JSON.parse(raw);
  } catch {
    return { group: groupName, inserted: 0, error: "Failed to parse LLM response" };
  }

  const result = LeadsOutputSchema.safeParse(parsed);
  if (!result.success) return { group: groupName, inserted: 0, error: "Invalid lead format" };

  const { data: existingLeads } = await supabase
    .from("editorial_leads")
    .select("angle")
    .eq("workspace_id", workspaceId)
    .in("status", ["pending_review", "approved"])
    .limit(100);

  const existingAngles = new Set((existingLeads ?? []).map((l) => (l.angle ?? "").toLowerCase().trim()));

  let inserted = 0;
  for (const lead of result.data.leads) {
    const validSources = lead.sources.filter((u) => allowedUrls.has(u));
    if (validSources.length === 0) continue;
    if (existingAngles.has(lead.angle.toLowerCase().trim())) continue;

    const sourcesBlock = "\n\nSources:\n" + validSources.join("\n");
    const { error } = await supabase.from("editorial_leads").insert({
      workspace_id: workspaceId,
      brand_profile_id: brandProfileId,
      angle: lead.angle,
      why_now: lead.why_now,
      who_it_impacts: lead.who_it_impacts,
      contrarian_take: lead.contrarian_take + sourcesBlock,
      confidence_score: lead.confidence,
      status: "pending_review",
    });
    if (!error) {
      inserted++;
      existingAngles.add(lead.angle.toLowerCase().trim());
    }
  }

  return { group: groupName, inserted, signals_used: signals.length };
}

export function createWriterAgent(workspaceId: string, brandProfileId: string): AgentDefinition {
  return {
    id: "writer",
    name: "Writer Agent",
    role: "leads",
    systemPrompt: `You are the Writer Agent in a newsroom. Your job is to generate editorial leads from fresh signals.

Your workflow:
1. Call check_existing_leads to see how many active leads exist.
2. If there are already 10+ pending leads, skip generation and signal done — the review queue is full.
3. Call query_fresh_signals to see what's available. It returns two pools:
   - directive_groups: signals from the legacy directive pipeline
   - source_groups: signals from the new research sources pipeline (no directive attached)
4. For each directive_group with 3+ signals, call generate_leads_for_directive.
5. For each source_group with 3+ signals, call generate_leads_for_source with that publisher.
   If there are undirected signals but no clear publisher grouping, call generate_leads_for_source without a publisher to use all undirected signals together.
6. Skip any group with fewer than 3 signals — not enough material.
7. Signal done with a summary of leads generated across all groups.

Be selective. Quality over quantity. Don't flood the review queue.`,
    tools: createWriterTools(workspaceId, brandProfileId),
    maxIterations: 15,
  };
}
