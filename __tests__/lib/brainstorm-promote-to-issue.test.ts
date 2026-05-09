import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabase } from "../api/helpers";

const { mockCallLLM, mockGetModelForRole } = vi.hoisted(() => ({
  mockCallLLM: vi.fn(),
  mockGetModelForRole: vi.fn(),
}));

vi.mock("@/lib/llm/provider", () => ({
  callLLM: (...args: unknown[]) => mockCallLLM(...args),
  getModelForRole: (...args: unknown[]) => mockGetModelForRole(...args),
}));

import { promoteBrainstormSessionToIssueDraft } from "@/lib/brainstorm/promote-to-issue";

beforeEach(() => {
  vi.clearAllMocks();
  mockGetModelForRole.mockReturnValue({ provider: "anthropic", model: "claude-test" });
});

function makeDraftObject() {
  return {
    title: "Identity Boundaries Are Collapsing",
    hook_paragraphs: ["Paragraph one.", "Paragraph two."],
    fresh_signals: "Fresh signal summary",
    deep_dive: "Deep dive body",
    dojo_checklist: ["One", "Two", "Three", "Four", "Five"],
    promo_slot: "Subscribe CTA",
    close: "Close line",
    sources: ["https://example.com/source-a"],
    metadata: { model: "claude-test", thesis: "Treat machine identities as first-class actors." },
  };
}

describe("promoteBrainstormSessionToIssueDraft", () => {
  it("rejects promotion when working artifact is missing", async () => {
    const supabase = createMockSupabase();

    await expect(
      promoteBrainstormSessionToIssueDraft({
        supabase: supabase as never,
        workspaceId: "ws-123",
        sessionId: "sess-1",
        artifactJson: {},
        brandProfileId: "bp-1",
      })
    ).rejects.toThrow("Nothing to promote");
  });

  it("builds context from cited signals and inserts issue draft", async () => {
    const supabase = createMockSupabase();
    const signalsChain = supabase._setResult("signals", {
      data: [
        {
          id: "sig-1",
          title: "Signal one",
          url: "https://example.com/sig-1",
          normalized_summary: "Summary one",
        },
      ],
      error: null,
    });
    const draftsChain = supabase._setResult("issue_drafts", {
      data: { id: "draft-123" },
      error: null,
    });
    mockCallLLM.mockResolvedValueOnce({
      text: `Here is your object:
\`\`\`json
${JSON.stringify(makeDraftObject(), null, 2)}
\`\`\``,
      provider: "anthropic",
      model: "claude-test",
    });

    const result = await promoteBrainstormSessionToIssueDraft({
      supabase: supabase as never,
      workspaceId: "ws-123",
      sessionId: "sess-1",
      artifactJson: {
        working_artifact: {
          working_outline: "Outline text",
          cited_signal_ids: ["sig-1"],
          thesis: "draft thesis",
        },
      },
      brandProfileId: "bp-1",
    });

    expect(signalsChain.in).toHaveBeenCalledWith("id", ["sig-1"]);
    expect(mockCallLLM).toHaveBeenCalledTimes(1);
    const llmUserMessage = (mockCallLLM.mock.calls[0]?.[1] as Array<{ role: string; content: string }>).find(
      (m) => m.role === "user"
    )?.content;
    expect(llmUserMessage).toContain("cited_signals_context");
    expect(llmUserMessage).toContain("Signal one");
    expect(draftsChain.insert).toHaveBeenCalledWith({
      workspace_id: "ws-123",
      brand_profile_id: "bp-1",
      content: expect.stringContaining("**Identity Boundaries Are Collapsing**"),
      content_json: expect.objectContaining({
        title: "Identity Boundaries Are Collapsing",
      }),
    });
    expect(result).toEqual({
      draftId: "draft-123",
      contentJson: expect.objectContaining({
        metadata: { model: "claude-test", thesis: "Treat machine identities as first-class actors." },
      }),
    });
  });

  it("throws when model output cannot be parsed as json", async () => {
    const supabase = createMockSupabase();
    supabase._setResult("signals", { data: [], error: null });
    mockCallLLM.mockResolvedValueOnce({
      text: "not-json",
      provider: "anthropic",
      model: "claude-test",
    });

    await expect(
      promoteBrainstormSessionToIssueDraft({
        supabase: supabase as never,
        workspaceId: "ws-123",
        sessionId: "sess-1",
        artifactJson: { working_artifact: { cited_signal_ids: [] } },
        brandProfileId: "bp-1",
      })
    ).rejects.toThrow("Model did not return a JSON object for DraftObject");
  });

  it("throws when returned json fails DraftObject validation", async () => {
    const supabase = createMockSupabase();
    supabase._setResult("signals", { data: [], error: null });
    mockCallLLM.mockResolvedValueOnce({
      text: JSON.stringify({
        ...makeDraftObject(),
        metadata: { model: "claude-test" },
      }),
      provider: "anthropic",
      model: "claude-test",
    });

    await expect(
      promoteBrainstormSessionToIssueDraft({
        supabase: supabase as never,
        workspaceId: "ws-123",
        sessionId: "sess-1",
        artifactJson: { working_artifact: { cited_signal_ids: [] } },
        brandProfileId: "bp-1",
      })
    ).rejects.toThrow("metadata.thesis is required");
  });
});
