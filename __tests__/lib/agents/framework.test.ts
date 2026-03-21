import { describe, it, expect, vi, beforeEach } from "vitest";
import { runAgent, type AgentDefinition, type AgentTool } from "@/lib/agents/framework";

const mockCallLLM = vi.fn();

vi.mock("@/lib/llm/provider", () => ({
  callLLM: (...args: unknown[]) => mockCallLLM(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

function makeTool(name: string, result: unknown): AgentTool {
  return {
    name,
    description: `Test tool: ${name}`,
    execute: vi.fn().mockResolvedValue(result),
  };
}

function makeAgent(tools: AgentTool[], overrides: Partial<AgentDefinition> = {}): AgentDefinition {
  return {
    id: "test-agent",
    name: "Test Agent",
    role: "research",
    systemPrompt: "You are a test agent.",
    tools,
    maxIterations: 5,
    ...overrides,
  };
}

describe("runAgent", () => {
  it("calls a tool and completes when LLM signals done", async () => {
    const tool = makeTool("get_data", { value: 42 });
    const agent = makeAgent([tool]);

    mockCallLLM
      .mockResolvedValueOnce({ text: '{"tool": "get_data", "params": {}}', provider: "anthropic", model: "test" })
      .mockResolvedValueOnce({ text: '{"done": true, "summary": "Got data", "decisions": ["Fetched data"]}', provider: "anthropic", model: "test" });

    const result = await runAgent(agent);

    expect(result.success).toBe(true);
    expect(result.summary).toBe("Got data");
    expect(result.decisions).toContain("Called get_data({})");
    expect(tool.execute).toHaveBeenCalledTimes(1);
  });

  it("handles tool not found gracefully", async () => {
    const tool = makeTool("real_tool", { ok: true });
    const agent = makeAgent([tool]);

    mockCallLLM
      .mockResolvedValueOnce({ text: '{"tool": "fake_tool", "params": {}}', provider: "anthropic", model: "test" })
      .mockResolvedValueOnce({ text: '{"tool": "real_tool", "params": {}}', provider: "anthropic", model: "test" })
      .mockResolvedValueOnce({ text: '{"done": true, "summary": "Recovered", "decisions": []}', provider: "anthropic", model: "test" });

    const result = await runAgent(agent);

    expect(result.success).toBe(true);
    expect(result.summary).toBe("Recovered");
  });

  it("handles tool execution errors", async () => {
    const tool: AgentTool = {
      name: "failing_tool",
      description: "A tool that fails",
      execute: vi.fn().mockRejectedValue(new Error("DB connection lost")),
    };
    const agent = makeAgent([tool]);

    mockCallLLM
      .mockResolvedValueOnce({ text: '{"tool": "failing_tool", "params": {}}', provider: "anthropic", model: "test" })
      .mockResolvedValueOnce({ text: '{"done": true, "summary": "Handled failure", "decisions": ["Skipped failing tool"]}', provider: "anthropic", model: "test" });

    const result = await runAgent(agent);

    expect(result.success).toBe(true);
    expect(result.summary).toBe("Handled failure");
  });

  it("fails after max iterations", async () => {
    const agent = makeAgent([], { maxIterations: 2 });

    mockCallLLM
      .mockResolvedValue({ text: "I am confused", provider: "anthropic", model: "test" });

    const result = await runAgent(agent);

    expect(result.success).toBe(false);
    expect(result.error).toBe("max_iterations_reached");
  });

  it("passes context to the agent", async () => {
    const agent = makeAgent([]);

    mockCallLLM
      .mockResolvedValueOnce({ text: '{"done": true, "summary": "Used context", "decisions": []}', provider: "anthropic", model: "test" });

    await runAgent(agent, { workspace_id: "ws-1", custom_key: "custom_value" });

    const userMessage = mockCallLLM.mock.calls[0][1].find((m: { role: string }) => m.role === "user");
    expect(userMessage.content).toContain("custom_key");
    expect(userMessage.content).toContain("custom_value");
  });

  it("handles JSON wrapped in markdown fences", async () => {
    const tool = makeTool("check", { status: "ok" });
    const agent = makeAgent([tool]);

    mockCallLLM
      .mockResolvedValueOnce({ text: '```json\n{"tool": "check", "params": {}}\n```', provider: "anthropic", model: "test" })
      .mockResolvedValueOnce({ text: '{"done": true, "summary": "Done", "decisions": []}', provider: "anthropic", model: "test" });

    const result = await runAgent(agent);

    expect(result.success).toBe(true);
    expect(tool.execute).toHaveBeenCalledTimes(1);
  });

  it("chains multiple tool calls", async () => {
    const tool1 = makeTool("step_one", { phase: 1 });
    const tool2 = makeTool("step_two", { phase: 2 });
    const agent = makeAgent([tool1, tool2]);

    mockCallLLM
      .mockResolvedValueOnce({ text: '{"tool": "step_one", "params": {}}', provider: "anthropic", model: "test" })
      .mockResolvedValueOnce({ text: '{"tool": "step_two", "params": {"input": "from_one"}}', provider: "anthropic", model: "test" })
      .mockResolvedValueOnce({ text: '{"done": true, "summary": "Both steps done", "decisions": ["Ran both"]}', provider: "anthropic", model: "test" });

    const result = await runAgent(agent);

    expect(result.success).toBe(true);
    expect(tool1.execute).toHaveBeenCalledTimes(1);
    expect(tool2.execute).toHaveBeenCalledTimes(1);
    expect(result.decisions).toHaveLength(3);
  });
});
