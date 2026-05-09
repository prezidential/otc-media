import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabase } from "../api/helpers";

const mockCallLLM = vi.fn();

vi.mock("@/lib/llm/provider", () => ({
  callLLM: (...args: unknown[]) => mockCallLLM(...args),
  getModelForRole: (role: string) => ({
    provider: "openai",
    model: role === "drafting" ? "draft-model" : "other-model",
  }),
}));

import { promoteBrainstormSessionToIssueDraft } from "@/lib/brainstorm/promote-to-issue";

const validDraftObject = {
  title: "Issue title",
  hook_paragraphs: ["Hook one", "Hook two"],
  fresh_signals: "Signal context",
  deep_dive: "Deep dive",
  dojo_checklist: ["One", "Two", "Three", "Four", "Five"],
  promo_slot: "Subscribe.",
  close: "See you soon.",
  sources: ["https://example.com/a"],
  metadata: { model: "draft-model", thesis: "Thesis" },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("promoteBrainstormSessionToIssueDraft", () => {
  it("requires a saved working artifact before promotion", async () => {
    await expect(
      promoteBrainstormSessionToIssueDraft({
        supabase: createMockSupabase() as never,
        workspaceId: "ws-1",
        sessionId: "session-1",
        artifactJson: {},
        brandProfileId: "brand-1",
      })
    ).rejects.toThrow("save an artifact");
    expect(mockCallLLM).not.toHaveBeenCalled();
  });

  it("hydrates cited signal context, validates LLM JSON, and inserts a draft scoped to the workspace", async () => {
    const mockSupabase = createMockSupabase();
    const signalsChain = mockSupabase._setResult("signals", {
      data: [
        {
          id: "signal-1",
          title: "Signal One",
          url: "https://example.com/a",
          normalized_summary: "Useful signal summary",
        },
      ],
      error: null,
    });
    const draftsChain = mockSupabase._setResult("issue_drafts", {
      data: { id: "draft-1" },
      error: null,
    });
    mockCallLLM.mockResolvedValueOnce({
      text: `Here is the JSON:\n${JSON.stringify(validDraftObject)}`,
    });

    const result = await promoteBrainstormSessionToIssueDraft({
      supabase: mockSupabase as never,
      workspaceId: "ws-1",
      sessionId: "session-1",
      artifactJson: {
        working_artifact: {
          thesis: "Working thesis",
          working_outline: "Outline",
          cited_signal_ids: ["signal-1", "", 42, "signal-2"],
        },
      },
      brandProfileId: "brand-1",
    });

    expect(result.draftId).toBe("draft-1");
    expect(result.contentJson).toEqual(validDraftObject);
    expect(signalsChain.eq).toHaveBeenCalledWith("workspace_id", "ws-1");
    expect(signalsChain.in).toHaveBeenCalledWith("id", ["signal-1", "signal-2"]);
    expect(mockCallLLM).toHaveBeenCalledWith(
      "drafting",
      expect.arrayContaining([
        expect.objectContaining({ role: "system" }),
        expect.objectContaining({
          role: "user",
          content: expect.stringContaining("Useful signal summary"),
        }),
      ]),
      { max_tokens: 8192, temperature: 0.35 }
    );
    expect(draftsChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        workspace_id: "ws-1",
        brand_profile_id: "brand-1",
        content_json: validDraftObject,
      })
    );
    expect(draftsChain.insert.mock.calls[0][0].content).toContain("# Issue title");
  });

  it("rejects invalid model output before inserting an issue draft", async () => {
    const mockSupabase = createMockSupabase();
    const draftsChain = mockSupabase._setResult("issue_drafts", {
      data: { id: "draft-1" },
      error: null,
    });
    mockCallLLM.mockResolvedValueOnce({
      text: JSON.stringify({ ...validDraftObject, sources: ["ok", 123] }),
    });

    await expect(
      promoteBrainstormSessionToIssueDraft({
        supabase: mockSupabase as never,
        workspaceId: "ws-1",
        sessionId: "session-1",
        artifactJson: { working_artifact: { thesis: "Working thesis" } },
        brandProfileId: "brand-1",
      })
    ).rejects.toThrow('"sources" must contain only strings');
    expect(draftsChain.insert).not.toHaveBeenCalled();
  });
});
