import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCallLLM, mockStreamLLM, mockExecuteBrainstormTool, mockBuildInstructions } = vi.hoisted(() => ({
  mockCallLLM: vi.fn(),
  mockStreamLLM: vi.fn(),
  mockExecuteBrainstormTool: vi.fn(),
  mockBuildInstructions: vi.fn(),
}));

vi.mock("@/lib/llm/provider", () => ({
  callLLM: (...args: unknown[]) => mockCallLLM(...args),
  streamLLM: (...args: unknown[]) => mockStreamLLM(...args),
}));

vi.mock("@/lib/brainstorm/signal-tools", () => ({
  executeBrainstormTool: (...args: unknown[]) => mockExecuteBrainstormTool(...args),
}));

vi.mock("@/lib/brainstorm/system-prompt", () => ({
  buildBrainstormToolInstructions: (...args: unknown[]) => mockBuildInstructions(...args),
}));

import { runBrainstormTurn } from "@/lib/brainstorm/turn";

beforeEach(() => {
  vi.clearAllMocks();
  mockBuildInstructions.mockReturnValue("tool instructions");
});

describe("runBrainstormTurn", () => {
  it("executes tools and returns final assistant reply", async () => {
    mockCallLLM
      .mockResolvedValueOnce({ text: '{"tool":"query_signals","params":{"q":"oauth"}}' })
      .mockResolvedValueOnce({ text: '{"assistant":"Final brainstorm answer"}' });
    mockExecuteBrainstormTool.mockResolvedValueOnce({ signals: [{ id: "sig-1" }], count: 1 });

    const supabase = { from: vi.fn() };
    const result = await runBrainstormTurn({
      supabase: supabase as never,
      workspaceId: "ws-123",
      sessionId: "sess-1",
      brandBlock: "brand context",
      history: [{ role: "user", content: "What changed?" }],
    });

    expect(result.assistant).toBe("Final brainstorm answer");
    expect(result.toolCalls).toEqual([{ tool: "query_signals", params: { q: "oauth" } }]);
    expect(result.toolResults).toEqual([{ signals: [{ id: "sig-1" }], count: 1 }]);
    expect(mockExecuteBrainstormTool).toHaveBeenCalledWith(
      supabase,
      "ws-123",
      "query_signals",
      { q: "oauth" },
      { sessionId: "sess-1" }
    );
    const firstMessages = mockCallLLM.mock.calls[0]?.[1] as Array<{ role: string; content: string }>;
    expect(firstMessages[0]?.content).toContain("tool instructions");
    expect(firstMessages[0]?.content).toContain("brand context");
  });

  it("captures tool failures and still returns assistant content", async () => {
    mockCallLLM
      .mockResolvedValueOnce({ text: '{"tool":"get_signal","params":{"id":"sig-1"}}' })
      .mockResolvedValueOnce({ text: '{"assistant":"Recovered despite tool failure"}' });
    mockExecuteBrainstormTool.mockRejectedValueOnce(new Error("signal lookup failed"));

    const result = await runBrainstormTurn({
      supabase: { from: vi.fn() } as never,
      workspaceId: "ws-123",
      sessionId: "sess-1",
      brandBlock: null,
      history: [{ role: "user", content: "Check this signal" }],
    });

    expect(result.assistant).toBe("Recovered despite tool failure");
    expect(result.toolCalls).toEqual([{ tool: "get_signal", params: { id: "sig-1" } }]);
    expect(result.toolResults).toEqual([{ error: "signal lookup failed" }]);
  });

  it("returns step-limit fallback when model never provides final assistant", async () => {
    mockCallLLM.mockResolvedValue({ text: '{"tool":"query_signals","params":{}}' });
    mockExecuteBrainstormTool.mockResolvedValue({ signals: [], count: 0 });

    const result = await runBrainstormTurn({
      supabase: { from: vi.fn() } as never,
      workspaceId: "ws-123",
      sessionId: "sess-1",
      brandBlock: null,
      history: [{ role: "user", content: "Need insights" }],
    });

    expect(result.assistant).toContain("I hit the tool step limit");
    expect(result.toolCalls).toHaveLength(8);
    expect(result.toolResults).toHaveLength(8);
    expect(mockCallLLM).toHaveBeenCalledTimes(9);
    expect(mockExecuteBrainstormTool).toHaveBeenCalledTimes(8);
  });

  it("streams plain-text responses to chunk callback", async () => {
    mockStreamLLM.mockImplementationOnce(async function* () {
      yield "H";
      yield "i";
    });

    const chunks: string[] = [];
    const result = await runBrainstormTurn({
      supabase: { from: vi.fn() } as never,
      workspaceId: "ws-123",
      sessionId: "sess-1",
      brandBlock: null,
      history: [{ role: "user", content: "Say hi" }],
      stream: true,
      onStreamChunk: (s) => chunks.push(s),
    });

    expect(result.assistant).toBe("Hi");
    expect(chunks).toEqual(["H", "i"]);
    expect(mockCallLLM).not.toHaveBeenCalled();
  });
});
