import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabase } from "../../api/helpers";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("@/lib/publish/beehiiv", () => ({
  isBeehiivEnabled: vi.fn(),
  createBeehiivDraft: vi.fn(),
}));

vi.mock("@/lib/publish/renderHtml", () => ({
  renderDraftHtml: vi.fn(() => "<p>rendered</p>"),
}));

vi.mock("@/lib/notifications/factory", () => ({
  getProviderFromEnv: vi.fn(() => ({ sendStatusUpdate: vi.fn() })),
}));

import { createBeehiivDraft, isBeehiivEnabled } from "@/lib/publish/beehiiv";
import { renderDraftHtml } from "@/lib/publish/renderHtml";
import { runPublisher } from "@/lib/agents/publisher";

const mockIsBeehiivEnabled = vi.mocked(isBeehiivEnabled);
const mockCreateBeehiivDraft = vi.mocked(createBeehiivDraft);
const mockRenderDraftHtml = vi.mocked(renderDraftHtml);

const contentJson = {
  title: "Identity at scale",
  hook_paragraphs: [],
  fresh_signals: "",
  deep_dive: "",
  last_word: "",
  promo_slot: "",
  close: "",
  sources: [],
  metadata: { thesis: "The stack changed faster than controls" },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockIsBeehiivEnabled.mockReturnValue(true);
});

function withDraft(data: unknown) {
  const supabase = createMockSupabase();
  supabase._setResult("issue_drafts", { data, error: null });
  return supabase;
}

describe("runPublisher", () => {
  it("skips and does not touch data when Beehiiv is disabled", async () => {
    mockIsBeehiivEnabled.mockReturnValue(false);
    const supabase = createMockSupabase();

    const result = await runPublisher({
      workspaceId: "ws-1",
      supabase: supabase as unknown as SupabaseClient,
      draftId: "draft-1",
    });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.code).toBe("disabled");
    expect(result.loggable).toBe(false);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("fails as not_found when the draft is missing", async () => {
    const supabase = withDraft(null);

    const result = await runPublisher({
      workspaceId: "ws-1",
      supabase: supabase as unknown as SupabaseClient,
      draftId: "draft-1",
    });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.code).toBe("not_found");
    expect(result.loggable).toBe(false);
    expect(mockCreateBeehiivDraft).not.toHaveBeenCalled();
  });

  it("fails as no_content when the draft has no structured content", async () => {
    const supabase = withDraft({ id: "draft-1", content_json: null, status: "reviewed" });

    const result = await runPublisher({
      workspaceId: "ws-1",
      supabase: supabase as unknown as SupabaseClient,
      draftId: "draft-1",
    });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.code).toBe("no_content");
    expect(mockCreateBeehiivDraft).not.toHaveBeenCalled();
  });

  it("renders, pushes to Beehiiv, and marks the draft published", async () => {
    const supabase = withDraft({ id: "draft-1", content_json: contentJson, status: "reviewed" });
    mockCreateBeehiivDraft.mockResolvedValue({
      id: "post-1",
      title: "Identity at scale",
      status: "draft",
      web_url: "https://beehiiv.com/post-1",
    });

    const result = await runPublisher({
      workspaceId: "ws-1",
      supabase: supabase as unknown as SupabaseClient,
      draftId: "draft-1",
    });

    expect(result.ok).toBe(true);
    expect(result.loggable).toBe(true);
    expect(result.ok === true && result.beehiiv.id).toBe("post-1");

    expect(mockRenderDraftHtml).toHaveBeenCalledWith(contentJson);
    expect(mockCreateBeehiivDraft).toHaveBeenCalledWith({
      title: "Identity at scale",
      subtitle: "The stack changed faster than controls",
      htmlContent: "<p>rendered</p>",
    });

    // Draft is advanced to the published lifecycle state.
    const draftsChain = supabase._chains.get("issue_drafts")!;
    expect(draftsChain.update).toHaveBeenCalledWith({ status: "published" });

    // Audit trail covers each deterministic step.
    expect(result.decisions.some((d) => d.startsWith("render_html"))).toBe(true);
    expect(result.decisions.some((d) => d.startsWith("push_beehiiv"))).toBe(true);
    expect(result.decisions.some((d) => d.includes("published"))).toBe(true);
  });

  it("returns a loggable publish_failed result when Beehiiv errors", async () => {
    const supabase = withDraft({ id: "draft-1", content_json: contentJson, status: "reviewed" });
    mockCreateBeehiivDraft.mockRejectedValue(new Error("Beehiiv API error: quota exceeded"));

    const result = await runPublisher({
      workspaceId: "ws-1",
      supabase: supabase as unknown as SupabaseClient,
      draftId: "draft-1",
    });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.code).toBe("publish_failed");
    expect(result.loggable).toBe(true);
    expect(result.ok === false && result.error).toContain("quota exceeded");
  });
});
