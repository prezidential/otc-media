import { callLLM, type AgentRole, type LLMMessage } from "@/lib/llm/provider";

export type AgentTool = {
  name: string;
  description: string;
  execute: (params: Record<string, unknown>) => Promise<unknown>;
};

export type AgentRunState = {
  agent_id: string;
  workspace_id: string;
  run_id: string;
  status: "running" | "completed" | "failed" | "awaiting_human";
  context: Record<string, unknown>;
  decisions: string[];
  output_summary: string;
  started_at: string;
  completed_at?: string;
  triggered_by: string;
};

export type AgentDefinition = {
  id: string;
  name: string;
  role: AgentRole;
  systemPrompt: string;
  tools: AgentTool[];
  maxIterations?: number;
};

export type AgentResult = {
  success: boolean;
  summary: string;
  decisions: string[];
  data: Record<string, unknown>;
  error?: string;
};

function buildToolDescriptions(tools: AgentTool[]): string {
  return tools
    .map((t) => `- ${t.name}: ${t.description}`)
    .join("\n");
}

function buildToolCallPrompt(tools: AgentTool[]): string {
  return `You have access to these tools:
${buildToolDescriptions(tools)}

To use a tool, respond with EXACTLY this JSON format (no other text):
{"tool": "tool_name", "params": {"key": "value"}}

When you are finished and have no more tools to call, respond with:
{"done": true, "summary": "what you accomplished", "decisions": ["decision 1", "decision 2"]}

Always call at least one tool before finishing. Think step by step about what to do.`;
}

type ToolCall = { tool: string; params: Record<string, unknown> };
type DoneSignal = { done: true; summary: string; decisions: string[] };

function parseAgentResponse(text: string): ToolCall | DoneSignal | null {
  const stripped = text.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  try {
    const parsed = JSON.parse(stripped);
    if (parsed.done === true && typeof parsed.summary === "string") {
      return parsed as DoneSignal;
    }
    if (typeof parsed.tool === "string") {
      return { tool: parsed.tool, params: parsed.params ?? {} };
    }
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        const parsed = JSON.parse(match[0]);
        if (parsed.done === true) return parsed as DoneSignal;
        if (typeof parsed.tool === "string") return { tool: parsed.tool, params: parsed.params ?? {} };
      } catch { /* fall through */ }
    }
  }
  return null;
}

export async function runAgent(
  agent: AgentDefinition,
  context: Record<string, unknown> = {},
  opts: { maxIterations?: number } = {}
): Promise<AgentResult> {
  const maxIter = opts.maxIterations ?? agent.maxIterations ?? 10;
  const toolMap = new Map(agent.tools.map((t) => [t.name, t]));

  const messages: LLMMessage[] = [
    {
      role: "system",
      content: `${agent.systemPrompt}\n\n${buildToolCallPrompt(agent.tools)}`,
    },
    {
      role: "user",
      content: `Context for this run:\n${JSON.stringify(context, null, 2)}\n\nProceed with your task.`,
    },
  ];

  const decisions: string[] = [];
  const data: Record<string, unknown> = {};

  for (let i = 0; i < maxIter; i++) {
    const response = await callLLM(agent.role, messages, { max_tokens: 1024 });
    const parsed = parseAgentResponse(response.text);

    if (!parsed) {
      messages.push({ role: "assistant", content: response.text });
      messages.push({
        role: "user",
        content: "Respond with valid JSON only. Either call a tool or signal done.",
      });
      continue;
    }

    if ("done" in parsed && parsed.done) {
      return {
        success: true,
        summary: parsed.summary,
        decisions: [...decisions, ...(parsed.decisions ?? [])],
        data,
      };
    }

    const toolCall = parsed as ToolCall;
    const tool = toolMap.get(toolCall.tool);

    if (!tool) {
      messages.push({ role: "assistant", content: response.text });
      messages.push({
        role: "user",
        content: `Tool "${toolCall.tool}" not found. Available tools: ${[...toolMap.keys()].join(", ")}`,
      });
      continue;
    }

    messages.push({ role: "assistant", content: response.text });

    try {
      const result = await tool.execute(toolCall.params);
      const resultStr = JSON.stringify(result, null, 2);
      data[toolCall.tool] = result;
      decisions.push(`Called ${toolCall.tool}(${JSON.stringify(toolCall.params)})`);
      messages.push({
        role: "user",
        content: `Tool "${toolCall.tool}" returned:\n${resultStr}\n\nContinue with your task. Call another tool or signal done.`,
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      messages.push({
        role: "user",
        content: `Tool "${toolCall.tool}" failed: ${errMsg}\n\nDecide how to proceed.`,
      });
    }
  }

  return {
    success: false,
    summary: "Agent reached max iterations without completing",
    decisions,
    data,
    error: "max_iterations_reached",
  };
}
