import { beforeEach, describe, expect, it, vi } from "vitest";
import { runBrainstormTurn } from "@/lib/brainstorm/turn";

const providerMocks = vi.hoisted(() => ({
  callLLM: vi.fn(),
  streamLLM: vi.fn(),
}));

vi.mock("@/lib/llm/provider", () => ({
  callLLM: providerMocks.callLLM,
  streamLLM: providerMocks.streamLLM,
}));

async function* streamChunks(chunks: string[]) {
  for (const chunk of chunks) {
    yield chunk;
  }
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("runBrainstormTurn", () => {
  it("streams plain markdown after buffering the leading prefix", async () => {
    providerMocks.streamLLM.mockReturnValueOnce(
      streamChunks(["  ", "## Angle", "\nUse this signal."])
    );
    const chunks: string[] = [];

    const result = await runBrainstormTurn({
      supabase: {} as never,
      workspaceId: "ws-123",
      brandBlock: null,
      history: [{ role: "user", content: "Brainstorm an angle" }],
      stream: true,
      onStreamChunk: (text) => chunks.push(text),
    });

    expect(chunks).toEqual(["  ## Angle", "\nUse this signal."]);
    expect(result.assistant).toBe("## Angle\nUse this signal.");
    expect(providerMocks.callLLM).not.toHaveBeenCalled();
  });

  it("does not leak JSON assistant wrappers into streamed markdown chunks", async () => {
    providerMocks.streamLLM.mockReturnValueOnce(
      streamChunks(["\n ", '{"assistant":"Use the saved artifact."}'])
    );
    const chunks: string[] = [];

    const result = await runBrainstormTurn({
      supabase: {} as never,
      workspaceId: "ws-123",
      brandBlock: null,
      history: [{ role: "user", content: "Summarize the result" }],
      stream: true,
      onStreamChunk: (text) => chunks.push(text),
    });

    expect(chunks).toEqual([]);
    expect(result.assistant).toBe("Use the saved artifact.");
  });

  it("uses callLLM for non-streaming turns", async () => {
    providerMocks.callLLM.mockResolvedValueOnce({
      text: '{"assistant":"Done"}',
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
    });

    const result = await runBrainstormTurn({
      supabase: {} as never,
      workspaceId: "ws-123",
      brandBlock: "Brand rules",
      history: [{ role: "user", content: "No stream please" }],
    });

    expect(result.assistant).toBe("Done");
    expect(providerMocks.callLLM).toHaveBeenCalledTimes(1);
    expect(providerMocks.streamLLM).not.toHaveBeenCalled();
  });
});
