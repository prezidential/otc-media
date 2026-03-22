import { supabaseAdmin } from "@/lib/supabase/server";
import { type AgentDefinition, type AgentTool } from "./framework";

function createEditorTools(workspaceId: string): AgentTool[] {
  return [
    {
      name: "get_approved_leads",
      description: "Fetch all approved editorial leads for the workspace. Returns lead angles, why_now, who_it_impacts, and count.",
      execute: async () => {
        const supabase = supabaseAdmin();
        const { data: leads } = await supabase
          .from("editorial_leads")
          .select("id, angle, why_now, who_it_impacts, contrarian_take, confidence_score, created_at")
          .eq("workspace_id", workspaceId)
          .eq("status", "approved")
          .order("created_at", { ascending: false })
          .limit(20);

        if (!leads || leads.length === 0) return { count: 0, leads: [], sufficient: false };

        const summaries = leads.map((l) => ({
          id: l.id,
          angle: l.angle,
          why_now: l.why_now,
          who_it_impacts: l.who_it_impacts,
          confidence: l.confidence_score,
        }));

        return { count: leads.length, leads: summaries, sufficient: leads.length >= 3 };
      },
    },
    {
      name: "evaluate_material",
      description: "Evaluate whether the approved leads are strong enough for a newsletter and/or insider access. Provide your analysis of lead_count, theme_diversity (low/medium/high), premium_worthy (true/false and why), and recommended_output_mode (full_issue, insider_access, or bundle).",
      execute: async (params) => {
        return {
          evaluation: {
            lead_count: params.lead_count,
            theme_diversity: params.theme_diversity,
            premium_worthy: params.premium_worthy,
            premium_reasoning: params.premium_reasoning,
            recommended_output_mode: params.recommended_output_mode,
          },
          recorded: true,
        };
      },
    },
    {
      name: "select_steering",
      description: "Select editorial steering parameters. Provide aggression (1-5), audience (practitioner/ciso/board), focus (strategic/tactical/architecture), tone (reflective/confrontational/analytical/strategic), and reasoning for each choice.",
      execute: async (params) => {
        return {
          steering: {
            aggressionLevel: params.aggression ?? 3,
            audienceLevel: params.audience ?? "practitioner",
            focusArea: params.focus ?? "architecture",
            toneMode: params.tone ?? "strategic",
          },
          reasoning: params.reasoning ?? "Default steering",
          recorded: true,
        };
      },
    },
    {
      name: "generate_newsletter_draft",
      description: "Generate the full newsletter draft using the selected steering parameters and output mode. Provide brandProfileId, aggressionLevel, audienceLevel, focusArea, toneMode, outputMode (full_issue or bundle), and leadLimit (max leads to use).",
      execute: async (params) => {
        let origin = "http://localhost:3000";
        try {
          if (process.env.VERCEL_URL) origin = `https://${process.env.VERCEL_URL}`;
        } catch { /* keep default */ }

        const res = await fetch(`${origin}/api/issues/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            brandProfileId: params.brandProfileId,
            aggressionLevel: params.aggressionLevel ?? 3,
            audienceLevel: params.audienceLevel ?? "practitioner",
            focusArea: params.focusArea ?? "architecture",
            toneMode: params.toneMode ?? "strategic",
            outputMode: params.outputMode ?? "full_issue",
            leadLimit: params.leadLimit ?? 8,
          }),
        });

        const data = await res.json().catch(() => ({}));

        if (!data.ok) {
          return { success: false, error: data.error ?? `HTTP ${res.status}` };
        }

        return {
          success: true,
          stored: data.stored ?? false,
          title: data.draft?.match(/\*\*(.+?)\*\*/)?.[1] ?? "Unknown",
          draft_length: data.draft?.length ?? 0,
          has_insider: !!data.insiderDraft,
          curation: data.curation ?? null,
          lint_fixed: data.lintFixed ?? false,
        };
      },
    },
    {
      name: "update_draft_status",
      description: "Update the status of the most recent draft. Provide status: 'draft', 'reviewed', or 'published'.",
      execute: async (params) => {
        const status = params.status as string;
        if (!["draft", "reviewed", "published"].includes(status)) {
          return { error: "Invalid status. Use: draft, reviewed, published" };
        }

        const supabase = supabaseAdmin();
        const { data: latest } = await supabase
          .from("issue_drafts")
          .select("id")
          .eq("workspace_id", workspaceId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!latest) return { error: "No draft found" };

        const { error } = await supabase
          .from("issue_drafts")
          .update({ status })
          .eq("id", latest.id)
          .eq("workspace_id", workspaceId);

        if (error) return { error: error.message };
        return { updated: true, draft_id: latest.id, status };
      },
    },
  ];
}

export function createEditorAgent(workspaceId: string): AgentDefinition {
  return {
    id: "editor",
    name: "Editor Agent",
    role: "editor",
    systemPrompt: `You are the Editor-in-Chief of a B2B identity security newsletter. Your job is to review approved editorial leads and produce a newsletter draft.

Your workflow:
1. Call get_approved_leads to see what material is available.
2. If fewer than 3 leads are approved, signal done and explain that there isn't enough material.
3. Call evaluate_material with your analysis:
   - Assess theme diversity (are the leads covering different angles or all the same story?)
   - Determine if any material is premium-worthy for Insider Access (Insider Access is a paid offering — it should contain practitioner-grade tactical content that goes deeper than the public newsletter. Only recommend it if the leads contain genuinely differentiated operational insight.)
   - Recommend output mode: "full_issue" (always), "bundle" (only if premium material exists)
4. Call select_steering with your chosen parameters:
   - aggression: match the urgency of the leads (breach/attack stories → 4-5, governance/standards → 2-3)
   - audience: match who the leads impact most
   - focus: match the dominant theme (vendor analysis → strategic, how-to → tactical, system design → architecture)
   - tone: match the editorial posture (challenging claims → confrontational, explaining trends → analytical)
5. Call generate_newsletter_draft with your steering choices and the brand profile ID from the leads data.
6. Signal done with a summary of what you produced and why.

Editorial principles:
- Quality over quantity. A focused 4-lead newsletter beats a scattered 8-lead one.
- The newsletter title must be specific and provocative, never generic.
- Insider Access is premium. Don't produce it just because you can — produce it when the material deserves it.
- Every editorial choice should have a reason.`,
    tools: createEditorTools(workspaceId),
    maxIterations: 10,
  };
}
