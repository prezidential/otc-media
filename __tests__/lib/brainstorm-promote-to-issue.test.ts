import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { promoteBrainstormSessionToIssueDraft } from "@/lib/brainstorm/promote-to-issue";
import { callLLM } from "@/lib/llm/provider";

vi.mock("@/lib/llm/provider", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/llm/provider")>();
  return {
    ...actual,
    callLLM: vi.fn(),
  };
});

type QueryResult = { data: unknown; error: { message: string } | null };

class MockQuery {
  select = vi.fn(() => this);
  insert = vi.fn(() => this);
  eq = vi.fn(() => this);
  in = vi.fn(() => this);
  single = vi.fn(async () => this.result);

  constructor(private readonly result: QueryResult) {}

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.result).then(onfulfilled, onrejected);
  }
}

function createQueuedSupabase(queries: MockQuery[]) {
  return {
    from: vi.fn(() => {
      const query = queries.shift();
      if (!query) throw new Error("Unexpected Supabase query");
      return query;
    }),
  } as unknown as SupabaseClient;
}

const validDraft = {
  title: "OAuth Attack Paths",
  hook_paragraphs: ["Identity teams keep finding the same weak seam."],
  fresh_signals: "Fresh evidence from the cited source.",
  deep_dive: "A deeper analysis of the attack path.",
  dojo_checklist: ["Audit apps", "Rotate secrets", "Review scopes", "Alert on grants", "Practice rollback"],
  promo_slot: "Subscribe for the full playbook.",
  close: "Stay sharp.",
  sources: ["https://example.com/signal"],
  metadata: { model: "claude-sonnet-4-20250514", thesis: "OAuth needs runtime governance." },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("promoteBrainstormSessionToIssueDraft", () => {
  it("uses only cited workspace signals as context and inserts a validated rendered issue draft", async () => {
    const signalQuery = new MockQuery({
      data: [
        {
          id: "sig-1",
          title: "OAuth grant abuse",
          url: "https://example.com/signal",
          normalized_summary: "Attackers chained stale OAuth grants into persistence.",
        },
      ],
      error: null,
    });
    const insertDraft = new MockQuery({ data: { id: "draft-1" }, error: null });
    const supabase = createQueuedSupabase([signalQuery, insertDraft]);
    vi.mocked(callLLM).mockResolvedValue({
      text: `Here is the draft:\n\n${JSON.stringify(validDraft)}\n\nDone.`,
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
    });

    const result = await promoteBrainstormSessionToIssueDraft({
      supabase,
      workspaceId: "workspace-1",
      sessionId: "session-1",
      brandProfileId: "brand-1",
      artifactJson: {
        working_artifact: {
          outline: "Cover OAuth grant abuse.",
          cited_signal_ids: ["sig-1", "", 42, "sig-2"],
          thesis: "OAuth needs runtime governance.",
        },
      },
    });

    expect(result).toEqual({ draftId: "draft-1", contentJson: validDraft });
    expect(signalQuery.eq).toHaveBeenCalledWith("workspace_id", "workspace-1");
    expect(signalQuery.in).toHaveBeenCalledWith("id", ["sig-1", "sig-2"]);
    expect(callLLM).toHaveBeenCalledWith(
      "drafting",
      expect.arrayContaining([
        expect.objectContaining({
          role: "user",
          content: expect.stringContaining("OAuth grant abuse"),
        }),
      ]),
      { max_tokens: 8192, temperature: 0.35 }
    );
    expect(insertDraft.insert).toHaveBeenCalledWith({
      workspace_id: "workspace-1",
      brand_profile_id: "brand-1",
      content: expect.stringContaining("**OAuth Attack Paths**"),
      content_json: validDraft,
    });
  });

  it("rejects promotion when no working artifact has been saved", async () => {
    const supabase = createQueuedSupabase([]);

    await expect(
      promoteBrainstormSessionToIssueDraft({
        supabase,
        workspaceId: "workspace-1",
        sessionId: "session-1",
        brandProfileId: "brand-1",
        artifactJson: {},
      })
    ).rejects.toThrow("save an artifact");
    expect(callLLM).not.toHaveBeenCalled();
  });

  it("does not insert invalid model output", async () => {
    const signalQuery = new MockQuery({ data: [], error: null });
    const supabase = createQueuedSupabase([signalQuery]);
    vi.mocked(callLLM).mockResolvedValue({
      text: JSON.stringify({ ...validDraft, metadata: { model: "", thesis: "" } }),
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
    });

    await expect(
      promoteBrainstormSessionToIssueDraft({
        supabase,
        workspaceId: "workspace-1",
        sessionId: "session-1",
        brandProfileId: "brand-1",
        artifactJson: { working_artifact: { outline: "Draft this", cited_signal_ids: [] } },
      })
    ).rejects.toThrow("metadata.model is required");
  });
});
