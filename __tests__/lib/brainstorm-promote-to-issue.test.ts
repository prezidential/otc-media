import { beforeEach, describe, expect, it, vi } from "vitest";
import { callLLM, getModelForRole } from "@/lib/llm/provider";
import { promoteBrainstormSessionToIssueDraft } from "@/lib/brainstorm/promote-to-issue";

vi.mock("@/lib/llm/provider", () => ({
  callLLM: vi.fn(),
  getModelForRole: vi.fn(),
}));

const validDraft = {
  title: "The operating system for creator signals",
  hook_paragraphs: ["Signal volume keeps rising.", "The winners turn it into an editorial edge."],
  fresh_signals: "Two cited stories show distribution and tooling pressure.",
  deep_dive: "Creators need a repeatable system for deciding which signals become issues.",
  dojo_checklist: ["Pick one thesis", "Cite the source", "Name the reader", "Make the move", "Ship it"],
  promo_slot: "Subscribe for the next operator memo.",
  close: "See you in the next issue.",
  sources: ["https://example.com/signal-one"],
  metadata: {
    model: "claude-test",
    thesis: "Signal workflows reduce editorial drift.",
  },
};

function createPromoteSupabaseMock() {
  const signalQuery = {
    select: vi.fn(() => signalQuery),
    eq: vi.fn(() => signalQuery),
    in: vi.fn().mockResolvedValue({
      data: [
        {
          id: "sig-1",
          title: "Signal One",
          url: "https://example.com/signal-one",
          normalized_summary: "A useful source summary.",
        },
      ],
      error: null,
    }),
  };

  const issueQuery = {
    insert: vi.fn(() => issueQuery),
    select: vi.fn(() => issueQuery),
    single: vi.fn().mockResolvedValue({ data: { id: "draft-1" }, error: null }),
  };

  const from = vi.fn((table: string) => {
    if (table === "signals") return signalQuery;
    if (table === "issue_drafts") return issueQuery;
    throw new Error(`Unexpected table ${table}`);
  });

  return {
    supabase: { from },
    from,
    signalQuery,
    issueQuery,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getModelForRole).mockReturnValue({ provider: "anthropic", model: "claude-test" });
});

describe("promoteBrainstormSessionToIssueDraft", () => {
  it("validates noisy model JSON and inserts a rendered workspace-scoped draft", async () => {
    const { supabase, signalQuery, issueQuery } = createPromoteSupabaseMock();
    vi.mocked(callLLM).mockResolvedValue({
      text: `Here is the draft:\n${JSON.stringify(validDraft)}\nDone.`,
      provider: "anthropic",
      model: "claude-test",
    });

    const result = await promoteBrainstormSessionToIssueDraft({
      supabase: supabase as never,
      workspaceId: "workspace-1",
      sessionId: "session-1",
      brandProfileId: "brand-1",
      artifactJson: {
        working_artifact: {
          thesis: "Signal workflows reduce editorial drift.",
          cited_signal_ids: ["sig-1", "sig-2"],
          working_outline: "Opening thesis, cited signals, operator playbook.",
        },
      },
    });

    expect(result.draftId).toBe("draft-1");
    expect(result.contentJson).toEqual(validDraft);
    expect(signalQuery.eq).toHaveBeenCalledWith("workspace_id", "workspace-1");
    expect(signalQuery.in).toHaveBeenCalledWith("id", ["sig-1", "sig-2"]);

    const llmMessages = vi.mocked(callLLM).mock.calls[0]![1];
    expect(llmMessages[1]!.content).toContain("Signal One");
    expect(llmMessages[1]!.content).toContain("session-1");

    expect(issueQuery.insert).toHaveBeenCalledWith({
      workspace_id: "workspace-1",
      brand_profile_id: "brand-1",
      content: expect.stringContaining("The operating system for creator signals"),
      content_json: validDraft,
    });
  });

  it("rejects promotion before calling the model when no working artifact was saved", async () => {
    const { supabase, from } = createPromoteSupabaseMock();

    await expect(
      promoteBrainstormSessionToIssueDraft({
        supabase: supabase as never,
        workspaceId: "workspace-1",
        sessionId: "session-1",
        brandProfileId: "brand-1",
        artifactJson: {},
      })
    ).rejects.toThrow("Nothing to promote");

    expect(callLLM).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });
});
