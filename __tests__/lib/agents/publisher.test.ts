import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabase } from "../../api/helpers";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("@/lib/publish/beehiiv", () => ({
  isBeehiivEnabled: vi.fn(),
}));

vi.mock("@/lib/integrations/beehiiv/write", () => ({
  publishBeehiivPost: vi.fn(),
}));

vi.mock("@/lib/publish/renderHtml", () => ({
  renderDraftHtml: vi.fn(() => "<p>rendered</p>"),
}));

vi.mock("@/lib/notifications/factory", () => ({
  getProviderFromEnv: vi.fn(() => ({ sendStatusUpdate: vi.fn() })),
}));

import { isBeehiivEnabled } from "@/lib/publish/beehiiv";
import { publishBeehiivPost } from "@/lib/integrations/beehiiv/write";
import { renderDraftHtml } from "@/lib/publish/renderHtml";
import { runPublisher } from "@/lib/agents/publisher";

const mockIsBeehiivEnabled = vi.mocked(isBeehiivEnabled);
const mockPublishBeehiivPost = vi.mocked(publishBeehiivPost);
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
    expect(mockPublishBeehiivPost).not.toHaveBeenCalled();
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
    expect(mockPublishBeehiivPost).not.toHaveBeenCalled();
  });

  it("renders, creates a Beehiiv draft, stores the post id, and marks published", async () => {
    const supabase = withDraft({ id: "draft-1", content_json: contentJson, status: "reviewed" });
    mockPublishBeehiivPost.mockResolvedValue({
      id: "post-1",
      title: "Identity at scale",
      status: "draft",
      web_url: "https://beehiiv.com/post-1",
      action: "create",
      transport: "mcp",
    });

    const result = await runPublisher({
      workspaceId: "ws-1",
      supabase: supabase as unknown as SupabaseClient,
      draftId: "draft-1",
      userId: "user-1",
    });

    expect(result.ok).toBe(true);
    expect(result.loggable).toBe(true);
    expect(result.ok === true && result.beehiiv.id).toBe("post-1");
    expect(result.ok === true && result.action).toBe("create");

    expect(mockRenderDraftHtml).toHaveBeenCalledWith(contentJson);
    // First publish: no existing post id, so it creates.
    expect(mockPublishBeehiivPost).toHaveBeenCalledWith(
      {
        title: "Identity at scale",
        subtitle: "The stack changed faster than controls",
        htmlContent: "<p>rendered</p>",
        seo: undefined,
        previewText: undefined,
      },
      expect.objectContaining({ existingPostId: null })
    );

    // Draft is advanced to published AND the Beehiiv post id is persisted into
    // content_json.metadata so a re-publish edits the same post.
    const draftsChain = supabase._chains.get("issue_drafts")!;
    const updateArg = draftsChain.update.mock.calls[0][0] as {
      status: string;
      content_json: { metadata: { beehiiv_post_id: string } };
    };
    expect(updateArg.status).toBe("published");
    expect(updateArg.content_json.metadata.beehiiv_post_id).toBe("post-1");

    // Audit trail covers each deterministic step.
    expect(result.decisions.some((d) => d.startsWith("render_html"))).toBe(true);
    expect(result.decisions.some((d) => d.startsWith("push_beehiiv"))).toBe(true);
    expect(result.decisions.some((d) => d.includes("published"))).toBe(true);
  });

  it("re-publish edits the same post when a beehiiv_post_id is stored", async () => {
    const stored = {
      ...contentJson,
      metadata: { ...contentJson.metadata, beehiiv_post_id: "post-1" },
    };
    const supabase = withDraft({ id: "draft-1", content_json: stored, status: "published" });
    mockPublishBeehiivPost.mockResolvedValue({
      id: "post-1",
      title: "Identity at scale",
      status: "draft",
      web_url: "https://beehiiv.com/post-1",
      action: "update",
      transport: "mcp",
    });

    const result = await runPublisher({
      workspaceId: "ws-1",
      supabase: supabase as unknown as SupabaseClient,
      draftId: "draft-1",
      userId: "user-1",
    });

    expect(result.ok).toBe(true);
    expect(result.ok === true && result.action).toBe("update");
    expect(mockPublishBeehiivPost).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ existingPostId: "post-1" })
    );
  });

  it("surfaces a paywall reminder when the draft marks a paywall section", async () => {
    const paywalled = { ...contentJson, paywall_after_section: "deep_dive" };
    const supabase = withDraft({ id: "draft-1", content_json: paywalled, status: "reviewed" });
    mockPublishBeehiivPost.mockResolvedValue({
      id: "post-1",
      title: "Identity at scale",
      status: "draft",
      web_url: "https://beehiiv.com/post-1",
      action: "create",
      transport: "rest",
    });

    const result = await runPublisher({
      workspaceId: "ws-1",
      supabase: supabase as unknown as SupabaseClient,
      draftId: "draft-1",
    });

    expect(result.ok).toBe(true);
    expect(result.ok === true && result.paywallReminder).toContain("deep_dive");
    // The rendered HTML carries the visible marker; the real break is manual.
    const passedHtml = (mockPublishBeehiivPost.mock.calls[0][0] as { htmlContent: string })
      .htmlContent;
    expect(passedHtml).toContain("PAYWALL BREAK HERE");
  });

  it("returns a loggable publish_failed result when Beehiiv errors", async () => {
    const supabase = withDraft({ id: "draft-1", content_json: contentJson, status: "reviewed" });
    mockPublishBeehiivPost.mockRejectedValue(new Error("Beehiiv API error: quota exceeded"));

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
