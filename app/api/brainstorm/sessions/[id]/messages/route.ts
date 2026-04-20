import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { runBrainstormTurn } from "@/lib/brainstorm/turn";
import { buildBrandBrainstormBlock } from "@/lib/brainstorm/system-prompt";

type Ctx = { params: Promise<{ id: string }> };

const HISTORY_CAP = 36;

export async function GET(_req: Request, ctx: Ctx) {
  const workspaceId = process.env.WORKSPACE_ID?.trim();
  if (!workspaceId) {
    return NextResponse.json({ error: "WORKSPACE_ID not configured" }, { status: 500 });
  }

  const { id: sessionId } = await ctx.params;
  const supabase = supabaseAdmin();

  const { data: session, error: sErr } = await supabase
    .from("brainstorm_sessions")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("id", sessionId)
    .maybeSingle();

  if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 });
  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  const { data, error } = await supabase
    .from("brainstorm_messages")
    .select("id,role,content,tool_calls,tool_results,created_at")
    .eq("workspace_id", workspaceId)
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true })
    .limit(200);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ messages: data ?? [] });
}

export async function POST(req: Request, ctx: Ctx) {
  const workspaceId = process.env.WORKSPACE_ID?.trim();
  if (!workspaceId) {
    return NextResponse.json({ error: "WORKSPACE_ID not configured" }, { status: 500 });
  }

  const { id: sessionId } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const rawUserContent = typeof body.content === "string" ? body.content.trim() : "";
  let content = rawUserContent;
  const signalId = typeof body.signalId === "string" ? body.signalId.trim() : "";
  const useStream = body.stream === true;

  if (!content) {
    return NextResponse.json({ error: "content is required" }, { status: 400 });
  }

  const supabase = supabaseAdmin();

  const { data: session, error: sErr } = await supabase
    .from("brainstorm_sessions")
    .select("id,title,brand_profile_id")
    .eq("workspace_id", workspaceId)
    .eq("id", sessionId)
    .maybeSingle();

  if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 });
  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  if (signalId) {
    const { data: sig, error: gErr } = await supabase
      .from("signals")
      .select("id,title,url,publisher,normalized_summary")
      .eq("workspace_id", workspaceId)
      .eq("id", signalId)
      .maybeSingle();
    if (gErr) return NextResponse.json({ error: gErr.message }, { status: 500 });
    if (sig) {
      const block = [
        "### Pinned signal (user-selected)",
        `**${sig.title}**`,
        sig.url ? `URL: ${sig.url}` : "",
        sig.publisher ? `Publisher: ${sig.publisher}` : "",
        sig.normalized_summary ? `\nSummary:\n${sig.normalized_summary}` : "",
        "",
        "### User message",
        content,
      ]
        .filter(Boolean)
        .join("\n");
      content = block;
    }
  }

  const { error: uErr } = await supabase.from("brainstorm_messages").insert({
    workspace_id: workspaceId,
    session_id: sessionId,
    role: "user",
    content,
  });

  if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 });

  const { data: prior, error: pErr } = await supabase
    .from("brainstorm_messages")
    .select("role,content")
    .eq("workspace_id", workspaceId)
    .eq("session_id", sessionId)
    .in("role", ["user", "assistant"])
    .order("created_at", { ascending: true })
    .limit(HISTORY_CAP);

  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

  const userTurns = (prior ?? []).filter((m) => m.role === "user").length;
  const isFirstUserTurn = userTurns === 1;

  const history = (prior ?? []).map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content as string,
  }));

  let brandBlock: string | null = null;
  if (session.brand_profile_id) {
    const { data: bp, error: bpErr } = await supabase
      .from("brand_profiles")
      .select(
        "id,name,voice_rules_json,formatting_rules_json,forbidden_patterns_json,cta_rules_json,emoji_policy_json,narrative_preferences_json"
      )
      .eq("workspace_id", workspaceId)
      .eq("id", session.brand_profile_id)
      .maybeSingle();
    if (!bpErr && bp?.name) {
      const jsonFields = Object.fromEntries(
        Object.entries(bp).filter(([k, v]) => k !== "id" && k !== "name" && v != null)
      ) as Record<string, unknown>;
      brandBlock = buildBrandBrainstormBlock(bp.name, jsonFields);
    }
  }

  if (useStream) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (obj: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(`${JSON.stringify(obj)}\n`));
        };

        let turn: Awaited<ReturnType<typeof runBrainstormTurn>>;
        try {
          send({ type: "start" });
          turn = await runBrainstormTurn({
            supabase,
            workspaceId,
            sessionId,
            brandBlock,
            history,
            stream: true,
            onStreamChunk: (text) => send({ type: "delta", text }),
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          send({ type: "error", message: msg });
          controller.close();
          return;
        }

        const { data: assistantRow, error: aErr } = await supabase
          .from("brainstorm_messages")
          .insert({
            workspace_id: workspaceId,
            session_id: sessionId,
            role: "assistant",
            content: turn.assistant,
            tool_calls: turn.toolCalls.length > 0 ? turn.toolCalls : null,
            tool_results: turn.toolResults.length > 0 ? turn.toolResults : null,
          })
          .select("id,role,content,tool_calls,tool_results,created_at")
          .single();

        if (aErr) {
          send({ type: "error", message: aErr.message });
          controller.close();
          return;
        }

        const titleUpdate =
          session.title === "Brainstorm" && isFirstUserTurn
            ? { title: rawUserContent.split("\n")[0]!.slice(0, 120) }
            : {};

        await supabase
          .from("brainstorm_sessions")
          .update({
            updated_at: new Date().toISOString(),
            ...titleUpdate,
          })
          .eq("id", sessionId)
          .eq("workspace_id", workspaceId);

        const { data: all, error: lErr } = await supabase
          .from("brainstorm_messages")
          .select("id,role,content,tool_calls,tool_results,created_at")
          .eq("workspace_id", workspaceId)
          .eq("session_id", sessionId)
          .order("created_at", { ascending: true })
          .limit(200);

        if (lErr) {
          send({ type: "error", message: lErr.message });
          controller.close();
          return;
        }

        send({
          type: "done",
          messages: all ?? [],
          lastAssistant: assistantRow,
        });
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  let turn: Awaited<ReturnType<typeof runBrainstormTurn>>;
  try {
    turn = await runBrainstormTurn({
      supabase,
      workspaceId,
      sessionId,
      brandBlock,
      history,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const { data: assistantRow, error: aErr } = await supabase
    .from("brainstorm_messages")
    .insert({
      workspace_id: workspaceId,
      session_id: sessionId,
      role: "assistant",
      content: turn.assistant,
      tool_calls: turn.toolCalls.length > 0 ? turn.toolCalls : null,
      tool_results: turn.toolResults.length > 0 ? turn.toolResults : null,
    })
    .select("id,role,content,tool_calls,tool_results,created_at")
    .single();

  if (aErr) return NextResponse.json({ error: aErr.message }, { status: 500 });

  const titleUpdate =
    session.title === "Brainstorm" && isFirstUserTurn
      ? { title: rawUserContent.split("\n")[0]!.slice(0, 120) }
      : {};

  await supabase
    .from("brainstorm_sessions")
    .update({
      updated_at: new Date().toISOString(),
      ...titleUpdate,
    })
    .eq("id", sessionId)
    .eq("workspace_id", workspaceId);

  const { data: all, error: lErr } = await supabase
    .from("brainstorm_messages")
    .select("id,role,content,tool_calls,tool_results,created_at")
    .eq("workspace_id", workspaceId)
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true })
    .limit(200);

  if (lErr) return NextResponse.json({ error: lErr.message }, { status: 500 });

  return NextResponse.json({
    messages: all ?? [],
    lastAssistant: assistantRow,
  });
}
