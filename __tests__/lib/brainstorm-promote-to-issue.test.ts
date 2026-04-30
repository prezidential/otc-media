import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabase } from "../api/helpers";
import { promoteBrainstormSessionToIssueDraft } from "@/lib/brainstorm/promote-to-issue";

const { callLLMMock, getModelForRoleMock } = vi.hoisted(() => ({
  callLLMMock: vi.fn(),
  getModelForRoleMock: vi.fn(),
}));

vi.mock("@/lib/llm/provider", () => ({
  callLLM: callLLMMock,
  getModelForRole: getModelForRoleMock,
}));

const validDraft = {
  title: "Passkeys Need a Recovery Plan",
  hook_paragraphs: ["Passkeys are finally practical.", "Recovery is where teams stumble."],
  fresh_signals: "A fresh signal summary.",
  deep_dive: "The operational plan matters more than the login ceremony.",
  dojo_checklist: ["Map recovery", "Test helpdesk", "Segment admins", "Measure fallback", "Review logs"],
  promo_slot: "Subscribe for identity architecture notes.",
  close: "See you in the dojo.",
  sources: ["https://example.com/passkeys"],
  metadata: { model: "draft-model", thesis: "Recovery determines passkey success." },
};

beforeEach(() => {
  vi.clearAllMocks();
  getModelForRoleMock.mockReturnValue({ provider: "anthropic", model: "draft-model" });
});

describe("promoteBrainstormSessionToIssueDraft", () => {
  it("extracts fenced draft JSON from model prose and inserts rendered content", async () => {
    const supabase = createMockSupabase();
    const signalsChain = supabase._setResult("signals", {
      data: [
        {
          id: "sig-1",
          title: "Passkey rollout data",
          url: "https://example.com/passkeys",
          normalized_summary: "Enterprise rollout details.",
        },
      ],
      error: null,
    });
    const draftsChain = supabase._setResult("issue_drafts", {
      data: { id: "draft-1" },
      error: null,
    });
    callLLMMock.mockResolvedValueOnce({
      text: `Here is the draft object:\n\n\`\`\`json\n${JSON.stringify(validDraft)}\n\`\`\``,
      provider: "anthropic",
      model: "draft-model",
    });

    const result = await promoteBrainstormSessionToIssueDraft({
      supabase,
      workspaceId: "ws-123",
      sessionId: "session-1",
      brandProfileId: "brand-1",
      artifactJson: {
        working_artifact: {
          thesis: "Recovery determines passkey success.",
          cited_signal_ids: ["sig-1", "", 42, "sig-2"],
        },
      },
    });

    expect(result).toEqual({ draftId: "draft-1", contentJson: validDraft });
    expect(signalsChain.eq).toHaveBeenCalledWith("workspace_id", "ws-123");
    expect(signalsChain.in).toHaveBeenCalledWith("id", ["sig-1", "sig-2"]);
    expect(callLLMMock).toHaveBeenCalledWith(
      "drafting",
      expect.arrayContaining([
        expect.objectContaining({ role: "user", content: expect.stringContaining("Enterprise rollout details.") }),
      ]),
      { max_tokens: 8192, temperature: 0.35 }
    );
    expect(draftsChain.insert).toHaveBeenCalledWith({
      workspace_id: "ws-123",
      brand_profile_id: "brand-1",
      content: expect.stringContaining("Passkeys Need a Recovery Plan"),
      content_json: validDraft,
    });
  });

  it("rejects sessions without a saved working artifact before calling the model", async () => {
    const supabase = createMockSupabase();

    await expect(
      promoteBrainstormSessionToIssueDraft({
        supabase,
        workspaceId: "ws-123",
        sessionId: "session-1",
        brandProfileId: "brand-1",
        artifactJson: {},
      })
    ).rejects.toThrow("Nothing to promote");

    expect(callLLMMock).not.toHaveBeenCalled();
    expect(supabase.from).not.toHaveBeenCalled();
  });
});
