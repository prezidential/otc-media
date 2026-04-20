import type { SupabaseClient } from "@supabase/supabase-js";
import { callLLM, streamLLM, type LLMMessage } from "@/lib/llm/provider";
import { parseBrainstormResponse } from "@/lib/brainstorm/parse-response";
import { buildBrainstormToolInstructions } from "@/lib/brainstorm/system-prompt";
import { executeBrainstormTool, type BrainstormToolContext } from "@/lib/brainstorm/signal-tools";

export type BrainstormHistoryTurn = { role: "user" | "assistant"; content: string };

const MAX_TOOL_STEPS = 8;

export type BrainstormTurnResult = {
  assistant: string;
  toolCalls: { tool: string; params: Record<string, unknown> }[];
  toolResults: unknown[];
};

async function callLlmBrainstorm(
  messages: LLMMessage[],
  llmOpts: { max_tokens: number; temperature: number },
  stream?: { onChunk?: (s: string) => void }
): Promise<string> {
  if (!stream?.onChunk) {
    const response = await callLLM("brainstorm", messages, llmOpts);
    return response.text;
  }

  let full = "";
  let mode: "undecided" | "json" | "txt" = "undecided";
  let prefix = "";

  for await (const ch of streamLLM("brainstorm", messages, llmOpts)) {
    full += ch;
    if (mode === "undecided") {
      prefix += ch;
      const t = prefix.trimStart();
      if (t.length === 0) continue;
      mode = t[0] === "{" ? "json" : "txt";
      if (mode === "txt") {
        stream.onChunk(prefix);
        prefix = "";
      }
      continue;
    }
    if (mode === "txt") {
      stream.onChunk(ch);
    }
  }

  return full;
}

export async function runBrainstormTurn(opts: {
  supabase: SupabaseClient;
  workspaceId: string;
  sessionId?: string;
  brandBlock: string | null;
  history: BrainstormHistoryTurn[];
  stream?: boolean;
  onStreamChunk?: (s: string) => void;
}): Promise<BrainstormTurnResult> {
  const toolCalls: { tool: string; params: Record<string, unknown> }[] = [];
  const toolResults: unknown[] = [];
  const toolCtx: BrainstormToolContext = { sessionId: opts.sessionId };
  const markdownFinal = Boolean(opts.stream);

  const systemParts = [
    buildBrainstormToolInstructions({ markdownFinal }),
    opts.brandBlock,
  ].filter(Boolean);
  const messages: LLMMessage[] = [
    { role: "system", content: systemParts.join("\n\n") },
    ...opts.history.map((h) => ({ role: h.role, content: h.content } as LLMMessage)),
  ];

  const streamSink =
    opts.stream && opts.onStreamChunk ? { onChunk: opts.onStreamChunk } : undefined;

  for (let step = 0; step < MAX_TOOL_STEPS; step++) {
    const responseText = await callLlmBrainstorm(
      messages,
      { max_tokens: 4096, temperature: 0.55 },
      streamSink
    );
    const parsed = parseBrainstormResponse(responseText);

    if (!parsed) {
      messages.push({ role: "assistant", content: responseText });
      messages.push({
        role: "user",
        content: markdownFinal
          ? 'Reply with a single-line JSON tool call {"tool":"...","params":{...}} if you need data — otherwise write your final answer as markdown only (no JSON wrapper).'
          : 'Reply with valid JSON only: either a tool call {"tool":"...","params":{}} or final {"assistant":"..."}.',
      });
      continue;
    }

    if (parsed.kind === "assistant") {
      return { assistant: parsed.content, toolCalls, toolResults };
    }

    toolCalls.push({ tool: parsed.tool, params: parsed.params });
    messages.push({ role: "assistant", content: responseText });

    try {
      const result = await executeBrainstormTool(
        opts.supabase,
        opts.workspaceId,
        parsed.tool,
        parsed.params,
        toolCtx
      );
      toolResults.push(result);
      messages.push({
        role: "user",
        content: `Tool "${parsed.tool}" result:\n${JSON.stringify(result, null, 2)}\n\n${
          markdownFinal
            ? "Continue with another tool call (JSON only) or give your final markdown reply."
            : 'Continue with another tool call or respond with {"assistant":"..."}.'
        }`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toolResults.push({ error: msg });
      messages.push({
        role: "user",
        content: `Tool "${parsed.tool}" failed: ${msg}\n\n${
          markdownFinal
            ? "Continue or give your final markdown reply."
            : 'Continue or respond with {"assistant":"..."}.'
        }`,
      });
    }
  }

  const fallbackText = await callLlmBrainstorm(
    messages,
    { max_tokens: 2048, temperature: 0.4 },
    streamSink
  );
  const finalParsed = parseBrainstormResponse(fallbackText);
  if (finalParsed?.kind === "assistant") {
    return { assistant: finalParsed.content, toolCalls, toolResults };
  }
  return {
    assistant:
      "I hit the tool step limit without a clean final reply. Please try rephrasing, or ask a narrower question about your signals.",
    toolCalls,
    toolResults,
  };
}
