import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { claudeClient } from "@/lib/llm/claude";
import { LeadsOutputSchema, type LeadItem } from "@/lib/leads/leadSchema";

const MODEL = "claude-sonnet-4-20250514";
const MAX_TOKENS = 4096;

function parseJsonFromContent(text: string): unknown {
  const trimmed = text.trim();
  const codeBlock = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = codeBlock ? codeBlock[1].trim() : trimmed;
  return JSON.parse(raw);
}

function formatJsonField(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map((v) => `- ${typeof v === "object" && v !== null ? JSON.stringify(v) : v}`).join("\n");
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

function buildBrandSystemPrompt(name: string, jsonFields: Record<string, unknown>): string {
  const base = "You respond only with valid JSON. No code fences, no commentary.";
  const sections: string[] = [`Brand profile name: ${name}`];
  for (const [key, value] of Object.entries(jsonFields)) {
    if (value === null || value === undefined) continue;
    const label = key.replace(/_json$/, "").replace(/_/g, " ");
    const formatted = formatJsonField(value);
    if (formatted) sections.push(`\n${label}:\n${formatted}`);
  }
  return `${base}\n\n${sections.join("")}`;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const brandProfileId = body.brandProfileId as string | undefined;
  const days = typeof body.days === "number" ? body.days : 7;

  if (!brandProfileId) {
    return NextResponse.json({ error: "brandProfileId required" }, { status: 400 });
  }

  const workspaceId = process.env.WORKSPACE_ID!;
  const supabase = supabaseAdmin();

  const { data: brandProfile, error: profileError } = await supabase
    .from("brand_profiles")
    .select("id,name,voice_rules_json,formatting_rules_json,forbidden_patterns_json,cta_rules_json,emoji_policy_json,narrative_preferences_json")
    .eq("id", brandProfileId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 });
  if (!brandProfile) return NextResponse.json({ error: "Brand profile not found" }, { status: 404 });

  const { id: _id, name: profileName, ...rest } = brandProfile;
  const jsonFields: Record<string, unknown> = Object.fromEntries(
    Object.entries(rest).filter(([, v]) => v !== null && v !== undefined)
  );
  const systemPrompt = buildBrandSystemPrompt(profileName ?? "Default", jsonFields);

  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - days);
  const since = sinceDate.toISOString();

  const { data: runRow, error: runInsertError } = await supabase
    .from("runs")
    .insert({
      workspace_id: workspaceId,
      run_type: "lead_generation",
      status: "initiated",
      input_refs_json: { brandProfileId, days },
      output_refs_json: {},
    })
    .select("id")
    .single();

  if (runInsertError || !runRow?.id) {
    return NextResponse.json(
      { error: runInsertError?.message ?? "Failed to create run" },
      { status: 500 }
    );
  }

  const runId = runRow.id;
  let totalLeadsInserted = 0;
  const directiveCounts: {
    directive: string;
    inserted: number;
    discarded: number;
    discardedNote?: string;
  }[] = [];

  try {
    const { data: signals, error: sigError } = await supabase
      .from("signals")
      .select("id,directive_id,title,url,publisher")
      .eq("workspace_id", workspaceId)
      .gte("captured_at", since)
      .order("captured_at", { ascending: false });

    if (sigError) throw new Error(sigError.message);

    const byDirective = new Map<string | null, { title: string; url: string; publisher: string }[]>();
    for (const s of signals ?? []) {
      const key = s.directive_id ?? "none";
      if (!byDirective.has(key)) byDirective.set(key, []);
      const arr = byDirective.get(key)!;
      if (arr.length < 12) arr.push({ title: s.title ?? "", url: s.url ?? "", publisher: s.publisher ?? "" });
    }

    const directiveIds = [...byDirective.keys()].filter((id) => id !== "none");
    if (directiveIds.length === 0) {
      await supabase
        .from("runs")
        .update({
          status: "completed",
          output_refs_json: { directivesProcessed: 0, leadsInserted: 0, details: [] },
          finished_at: new Date().toISOString(),
        })
        .eq("id", runId);
      return NextResponse.json({
        ok: true,
        directivesProcessed: 0,
        leadsInserted: 0,
        details: [],
      });
    }

    const { data: directives } = await supabase
      .from("research_directives")
      .select("id, name")
      .eq("workspace_id", workspaceId)
      .in("id", directiveIds);

    const directiveNames = new Map((directives ?? []).map((d) => [d.id, d.name]));

    const client = claudeClient();

    for (const dirId of directiveIds) {
      const signalsList = byDirective.get(dirId) ?? [];
      if (signalsList.length === 0) continue;

      const allowedUrls = new Set(signalsList.map((s) => s.url));
      const directiveName = directiveNames.get(dirId) ?? "Unknown";

      const signalsText = signalsList
        .map((s) => `- title: ${s.title}\n  url: ${s.url}\n  publisher: ${s.publisher}`)
        .join("\n");

      const userPrompt = `You are an editorial lead generator. Use ONLY the following signals (title, url, publisher). Every citation URL in your response must be one of the "url" values below.

Signals:
${signalsText}

Return JSON only (no markdown, no explanation). Required shape:
{
  "directive": "${directiveName}",
  "leads": [
    {
      "angle": "string (min 10 chars)",
      "why_now": "string (min 10 chars)",
      "who_it_impacts": "string (min 5 chars)",
      "contrarian_take": "string (min 10 chars)",
      "confidence": 0.0 to 1.0,
      "sources": ["url1", "url2"]
    }
  ]
}
Produce exactly 2-4 leads. Every "sources" array must contain only URLs from the signals list above.`;

      let parsed: unknown;
      try {
        const msg = await client.messages.create({
          model: MODEL,
          max_tokens: MAX_TOKENS,
          system: systemPrompt,
          messages: [{ role: "user", content: userPrompt }],
        });
        const text =
          msg.content?.find((b) => b.type === "text")?.type === "text"
            ? (msg.content.find((b) => b.type === "text") as { type: "text"; text: string }).text
            : "";
        parsed = parseJsonFromContent(text);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await supabase
          .from("runs")
          .update({ status: "failed", error_message: msg, finished_at: new Date().toISOString() })
          .eq("id", runId);
        return NextResponse.json({ ok: false, error: msg }, { status: 500 });
      }

      const parsedResult = LeadsOutputSchema.safeParse(parsed);
      if (!parsedResult.success) {
        await supabase
          .from("runs")
          .update({
            status: "failed",
            error_message: `Invalid Claude output: ${parsedResult.error.message}`,
            finished_at: new Date().toISOString(),
          })
          .eq("id", runId);
        return NextResponse.json(
          { ok: false, error: "Invalid Claude output", details: parsedResult.error.message },
          { status: 422 }
        );
      }

      const validLeads: LeadItem[] = [];
      let discarded = 0;
      for (const lead of parsedResult.data.leads) {
        const validSources = lead.sources.filter((u) => allowedUrls.has(u));
        if (validSources.length === 0) {
          discarded++;
          continue;
        }
        validLeads.push({ ...lead, sources: validSources });
      }

      let insertedForDirective = 0;
      for (const lead of validLeads) {
        const sourcesBlock = "\n\nSources:\n" + lead.sources.join("\n");
        const contrarianWithSources = lead.contrarian_take + sourcesBlock;

        const { error: insertErr } = await supabase.from("editorial_leads").insert({
          workspace_id: workspaceId,
          cluster_id: null,
          brand_profile_id: brandProfileId,
          angle: lead.angle,
          why_now: lead.why_now,
          who_it_impacts: lead.who_it_impacts,
          contrarian_take: contrarianWithSources,
          confidence_score: lead.confidence,
          status: "pending_review",
        });
        if (!insertErr) {
          insertedForDirective++;
          totalLeadsInserted++;
        }
      }

      const detail: (typeof directiveCounts)[number] = {
        directive: directiveName,
        inserted: insertedForDirective,
        discarded,
      };
      if (discarded > 0) {
        detail.discardedNote = `${discarded} lead(s) discarded: invalid or missing sources`;
      }
      directiveCounts.push(detail);
    }

    await supabase
      .from("runs")
      .update({
        status: "completed",
        output_refs_json: {
          directivesProcessed: directiveCounts.length,
          leadsInserted: totalLeadsInserted,
          details: directiveCounts,
        },
        finished_at: new Date().toISOString(),
      })
      .eq("id", runId);

    return NextResponse.json({
      ok: true,
      directivesProcessed: directiveCounts.length,
      leadsInserted: totalLeadsInserted,
      details: directiveCounts,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await supabase
      .from("runs")
      .update({ status: "failed", error_message: msg, finished_at: new Date().toISOString() })
      .eq("id", runId);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
