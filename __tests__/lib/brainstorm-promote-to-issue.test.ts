import { beforeEach, describe, expect, it, vi } from "vitest";
import { promoteBrainstormSessionToIssueDraft } from "@/lib/brainstorm/promote-to-issue";

const providerMocks = vi.hoisted(() => ({
  callLLM: vi.fn(),
  getModelForRole: vi.fn(),
}));

vi.mock("@/lib/llm/provider", () => ({
  callLLM: providerMocks.callLLM,
  getModelForRole: providerMocks.getModelForRole,
}));

const draftObject = {
  title: "Promoted brainstorm",
  hook_paragraphs: ["Hook one", "Hook two"],
  fresh_signals: "Signal context",
  deep_dive: "Deep dive body",
  dojo_checklist: ["Check 1", "Check 2", "Check 3", "Check 4", "Check 5"],
  promo_slot: "Subscribe for more.",
  close: "See you next week.",
  sources: ["https://example.com/signal"],
  metadata: { model: "test-drafting-model", thesis: "This is the thesis." },
};

function createPromoteSupabase() {
  const signalResult = {
    data: [
      {
        id: "sig-1",
        title: "Signal One",
        url: "https://example.com/signal",
        normalized_summary: "Summary text",
      },
    ],
    error: null,
  };
  const insertResult = { data: { id: "draft-123" }, error: null };

  const signalsChain = {
    select: vi.fn(),
    eq: vi.fn(),
    in: vi.fn(),
  };
  signalsChain.select.mockReturnValue(signalsChain);
  signalsChain.eq.mockReturnValue(signalsChain);
  signalsChain.in.mockResolvedValue(signalResult);

  const draftsChain = {
    insert: vi.fn(),
    select: vi.fn(),
    single: vi.fn(),
  };
  draftsChain.insert.mockReturnValue(draftsChain);
  draftsChain.select.mockReturnValue(draftsChain);
  draftsChain.single.mockResolvedValue(insertResult);

  const from = vi.fn((table: string) => {
    if (table === "signals") return signalsChain;
    if (table === "issue_drafts") return draftsChain;
    throw new Error(`Unexpected table: ${table}`);
  });

  return {
    supabase: { from },
    from,
    signalsChain,
    draftsChain,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  providerMocks.getModelForRole.mockReturnValue({
    provider: "anthropic",
    model: "test-drafting-model",
  });
});

describe("promoteBrainstormSessionToIssueDraft", () => {
  it("turns a saved artifact into a validated issue draft insert", async () => {
    providerMocks.callLLM.mockResolvedValueOnce({
      text: `Model notes before JSON:\n${JSON.stringify(draftObject)}\nThanks.`,
      provider: "anthropic",
      model: "test-drafting-model",
    });
    const { supabase, signalsChain, draftsChain } = createPromoteSupabase();
    const citedSignalIds = Array.from({ length: 15 }, (_, i) => `sig-${i + 1}`);

    const result = await promoteBrainstormSessionToIssueDraft({
      supabase: supabase as never,
      workspaceId: "ws-123",
      sessionId: "session-1",
      brandProfileId: "brand-1",
      artifactJson: {
        working_artifact: {
          thesis: "Identity security angle",
          working_outline: "Outline",
          cited_signal_ids: [...citedSignalIds, 42, ""],
        },
      },
    });

    expect(result).toEqual({ draftId: "draft-123", contentJson: draftObject });
    expect(signalsChain.in).toHaveBeenCalledWith("id", citedSignalIds.slice(0, 12));
    expect(providerMocks.callLLM).toHaveBeenCalledWith(
      "drafting",
      expect.arrayContaining([
        expect.objectContaining({ role: "system" }),
        expect.objectContaining({
          role: "user",
          content: expect.stringContaining("Signal One"),
        }),
      ]),
      { max_tokens: 8192, temperature: 0.35 }
    );
    expect(draftsChain.insert).toHaveBeenCalledWith({
      workspace_id: "ws-123",
      brand_profile_id: "brand-1",
      content: expect.stringContaining("**Promoted brainstorm**"),
      content_json: draftObject,
    });
  });

  it("rejects promotion when no working artifact has been saved", async () => {
    const { supabase, from } = createPromoteSupabase();

    await expect(
      promoteBrainstormSessionToIssueDraft({
        supabase: supabase as never,
        workspaceId: "ws-123",
        sessionId: "session-1",
        brandProfileId: "brand-1",
        artifactJson: {},
      })
    ).rejects.toThrow("Nothing to promote");

    expect(from).not.toHaveBeenCalled();
    expect(providerMocks.callLLM).not.toHaveBeenCalled();
  });
});
