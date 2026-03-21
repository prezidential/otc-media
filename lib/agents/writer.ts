import { supabaseAdmin } from "@/lib/supabase/server";
import { callLLM } from "@/lib/llm/provider";
import { LeadsOutputSchema, type LeadItem } from "@/lib/leads/leadSchema";
import { type AgentDefinition, type AgentTool } from "./framework";

function createWriterTools(workspaceId: string, brandProfileId: string): AgentTool[] {
  return [
    {
      name: "query_fresh_signals",
      description: "Get recent signals from the last 14 days, grouped by directive. Returns signal counts per directive and whether there are enough for lead generation.",
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

        const byDirective = new Map<string, { count: number; titles: string[] }>();
        for (const s of signals ?? []) {
          const key = s.directive_id ?? "none";
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

        const groups = [...byDirective.entries()]
          .filter(([id]) => id !== "none")
          .map(([id, info]) => ({
            directive_id: id,
            directive_name: directiveNames.get(id) ?? "Unknown",
            signal_count: info.count,
            sample_titles: info.titles,
          }));

        return { total_signals: signals?.length ?? 0, directive_groups: groups };
      },
    },
    {
      name: "check_existing_leads",
      description: "Check how many pending and approved leads already exist per directive. Helps decide whether to generate more.",
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
      description: "Generate editorial leads from signals for a specific directive. Provide directive_id and directive_name.",
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

        const { data: brandProfile } = await supabase
          .from("brand_profiles")
          .select("name, voice_rules_json, formatting_rules_json, forbidden_patterns_json")
          .eq("id", brandProfileId)
          .eq("workspace_id", workspaceId)
          .maybeSingle();

        const systemPrompt = `You respond only with valid JSON. No code fences, no commentary.\nBrand: ${brandProfile?.name ?? "Default"}`;
        const signalsText = signals.map((s) => `- title: ${s.title}\n  url: ${s.url}\n  publisher: ${s.publisher}`).join("\n");
        const allowedUrls = new Set(signals.map((s) => s.url));

        const userPrompt = `You are an editorial lead generator. Use ONLY the following signals. Every citation URL must be from the list below.

Signals:
${signalsText}

Return JSON: {"directive":"${directiveName}","leads":[{"angle":"...","why_now":"...","who_it_impacts":"...","contrarian_take":"...","confidence":0.7,"sources":["url"]}]}
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
          return { directive: directiveName, inserted: 0, error: "Failed to parse LLM response" };
        }

        const result = LeadsOutputSchema.safeParse(parsed);
        if (!result.success) return { directive: directiveName, inserted: 0, error: "Invalid lead format" };

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

        return { directive: directiveName, inserted, signals_used: signals.length };
      },
    },
  ];
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
3. Call query_fresh_signals to see what's available by directive.
4. For each directive with 3+ signals, call generate_leads_for_directive.
5. Skip directives with fewer than 3 signals — not enough material.
6. Signal done with a summary of leads generated.

Be selective. Quality over quantity. Don't flood the review queue.`,
    tools: createWriterTools(workspaceId, brandProfileId),
    maxIterations: 15,
  };
}
