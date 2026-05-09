import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabase } from "../api/helpers";

const mockCallLLM = vi.fn();

vi.mock("@/lib/llm/provider", () => ({
  callLLM: (...args: unknown[]) => mockCallLLM(...args),
  getModelForRole: vi.fn(() => ({ provider: "anthropic", model: "test-drafting-model" })),
}));

import { promoteBrainstormSessionToIssueDraft } from "@/lib/brainstorm/promote-to-issue";

const validDraft = {
  title: "A sharper issue",
  hook_paragraphs: ["Hook one", "Hook two"],
  fresh_signals: "Fresh signal context.",
  deep_dive: "Deep dive body.",
  dojo_checklist: ["One", "Two", "Three", "Four", "Five"],
  promo_slot: "Subscribe for more.",
  close: "See you next week.",
  sources: ["https://example.com/source"],
  metadata: { model: "test-drafting-model", thesis: "The thesis" },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("promoteBrainstormSessionToIssueDraft", () => {
  it("includes cited signal snippets in the LLM prompt and persists the validated draft", async () => {
    const mockSupabase = createMockSupabase();
    const signalsChain = mockSupabase._setResult("signals", {
      data: [
        {
          id: "sig-1",
          title: "Signal One",
          url: "https://example.com/signal",
          normalized_summary: "This is important context.",
        },
      ],
      error: null,
    });
    const draftsChain = mockSupabase._setResult("issue_drafts", {
      data: { id: "draft-1" },
      error: null,
    });
    mockCallLLM.mockResolvedValueOnce({
      text: `Here is the draft:\n\`\`\`json\n${JSON.stringify(validDraft)}\n\`\`\``,
    });

    const result = await promoteBrainstormSessionToIssueDraft({
      supabase: mockSupabase as never,
      workspaceId: "ws-123",
      sessionId: "session-1",
      brandProfileId: "brand-1",
      artifactJson: {
        working_artifact: {
          thesis: "The thesis",
          cited_signal_ids: ["sig-1", "", 42, "sig-2"],
        },
      },
    });

    expect(result).toEqual({ draftId: "draft-1", contentJson: validDraft });
    expect(signalsChain.in).toHaveBeenCalledWith("id", ["sig-1", "sig-2"]);
    expect(mockCallLLM).toHaveBeenCalledWith(
      "drafting",
      expect.arrayContaining([
        expect.objectContaining({
          role: "user",
          content: expect.stringContaining("Signal One"),
        }),
      ]),
      { max_tokens: 8192, temperature: 0.35 }
    );
    expect(mockCallLLM.mock.calls[0][1][1].content).toContain("https://example.com/signal");
    expect(draftsChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        workspace_id: "ws-123",
        brand_profile_id: "brand-1",
        content_json: validDraft,
        content: expect.stringContaining("**A sharper issue**"),
      })
    );
  });

  it("fails before calling the model when no working artifact was saved", async () => {
    const mockSupabase = createMockSupabase();

    await expect(
      promoteBrainstormSessionToIssueDraft({
        supabase: mockSupabase as never,
        workspaceId: "ws-123",
        sessionId: "session-1",
        brandProfileId: "brand-1",
        artifactJson: {},
      })
    ).rejects.toThrow("Nothing to promote");

    expect(mockCallLLM).not.toHaveBeenCalled();
    expect(mockSupabase.from).not.toHaveBeenCalledWith("issue_drafts");
  });
});
