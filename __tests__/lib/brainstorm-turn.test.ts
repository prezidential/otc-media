import { beforeEach, describe, expect, it, vi } from "vitest";
import { callLLM } from "@/lib/llm/provider";
import { executeBrainstormTool } from "@/lib/brainstorm/signal-tools";
import { runBrainstormTurn } from "@/lib/brainstorm/turn";

vi.mock("@/lib/llm/provider", () => ({
  callLLM: vi.fn(),
  streamLLM: vi.fn(),
}));

vi.mock("@/lib/brainstorm/signal-tools", () => ({
  executeBrainstormTool: vi.fn(),
}));

const callLLMMock = vi.mocked(callLLM);
const executeBrainstormToolMock = vi.mocked(executeBrainstormTool);

describe("runBrainstormTurn", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("executes a model-requested tool and feeds the result into the final assistant reply", async () => {
    const supabase = { from: vi.fn() };
    callLLMMock
      .mockResolvedValueOnce({
        text: '{"tool":"query_signals","params":{"q":"oauth","limit":3}}',
        model: "brainstorm-model",
        provider: "anthropic",
      })
      .mockResolvedValueOnce({
        text: '{"assistant":"Use the OAuth signal as the lead."}',
        model: "brainstorm-model",
        provider: "anthropic",
      });
    executeBrainstormToolMock.mockResolvedValueOnce({
      signals: [{ id: "sig-1", title: "OAuth risk" }],
      count: 1,
    });

    const result = await runBrainstormTurn({
      supabase: supabase as never,
      workspaceId: "ws-123",
      sessionId: "session-1",
      brandBlock: "Brand rules",
      history: [{ role: "user", content: "Find a timely angle" }],
    });

    expect(executeBrainstormToolMock).toHaveBeenCalledWith(
      supabase,
      "ws-123",
      "query_signals",
      { q: "oauth", limit: 3 },
      { sessionId: "session-1" }
    );
    expect(result).toEqual({
      assistant: "Use the OAuth signal as the lead.",
      toolCalls: [{ tool: "query_signals", params: { q: "oauth", limit: 3 } }],
      toolResults: [{ signals: [{ id: "sig-1", title: "OAuth risk" }], count: 1 }],
    });

    const secondMessages = callLLMMock.mock.calls[1]![1];
    expect(secondMessages.at(-1)?.content).toContain('Tool "query_signals" result');
    expect(secondMessages.at(-1)?.content).toContain("OAuth risk");
  });

  it("records tool failures and lets the model recover with a final reply", async () => {
    const supabase = { from: vi.fn() };
    callLLMMock
      .mockResolvedValueOnce({
        text: '{"tool":"get_signal","params":{"id":"missing"}}',
        model: "brainstorm-model",
        provider: "anthropic",
      })
      .mockResolvedValueOnce({
        text: '{"assistant":"I could not find that signal, but here is a safer next step."}',
        model: "brainstorm-model",
        provider: "anthropic",
      });
    executeBrainstormToolMock.mockRejectedValueOnce(new Error("Signal not found"));

    const result = await runBrainstormTurn({
      supabase: supabase as never,
      workspaceId: "ws-123",
      sessionId: "session-1",
      brandBlock: null,
      history: [{ role: "user", content: "Open the missing signal" }],
    });

    expect(result.assistant).toBe("I could not find that signal, but here is a safer next step.");
    expect(result.toolResults).toEqual([{ error: "Signal not found" }]);

    const recoveryMessages = callLLMMock.mock.calls[1]![1];
    expect(recoveryMessages.at(-1)?.content).toContain('Tool "get_signal" failed: Signal not found');
    expect(recoveryMessages.at(-1)?.content).toContain('respond with {"assistant":"..."}');
  });
});
