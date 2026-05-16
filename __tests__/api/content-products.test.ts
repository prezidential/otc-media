import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabase, makeJsonRequest } from "./helpers";

const mockClaudeCreate = vi.fn();
const mockLoadDraftContentJson = vi.fn();
const mockDraftSummaryForContentProducts = vi.fn();
const mockSupabase = createMockSupabase();
const ctx = { supabase: mockSupabase, workspaceId: "ws-123", userId: "user-1", role: "owner" as const };
const { requireWorkspaceMock } = vi.hoisted(() => ({
  requireWorkspaceMock: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  requireWorkspace: requireWorkspaceMock,
}));

vi.mock("@/lib/llm/claude", () => ({
  claudeClient: () => ({
    messages: {
      create: (...args: unknown[]) => mockClaudeCreate(...args),
    },
  }),
}));

vi.mock("@/lib/content-products/loadDraft", () => ({
  loadDraftContentJson: (...args: unknown[]) => mockLoadDraftContentJson(...args),
}));

vi.mock("@/lib/content-products/promptContext", () => ({
  draftSummaryForContentProducts: (...args: unknown[]) =>
    mockDraftSummaryForContentProducts(...args),
}));

vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => mockSupabase,
  supabaseUser: async () => mockSupabase,
}));

import { POST as postPodcastOutline } from "@/app/api/content-products/podcast-outline/route";
import { POST as postSocialSnippets } from "@/app/api/content-products/social-snippets/route";
import { POST as postSponsorshipAlignment } from "@/app/api/content-products/sponsorship-alignment/route";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("WORKSPACE_ID", "ws-123");
  requireWorkspaceMock.mockImplementation(async () => ctx);
  mockLoadDraftContentJson.mockResolvedValue({
    ok: true,
    draftId: "draft-1",
    contentJson: { title: "Draft title" },
  });
  mockDraftSummaryForContentProducts.mockReturnValue("Summarized draft context");
});

describe("content-products routes", () => {
  it("returns auth error response when requireWorkspace rejects", async () => {
    requireWorkspaceMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401 })
    );

    const req = makeJsonRequest(
      "http://localhost:3000/api/content-products/podcast-outline",
      { content_json: { title: "x" } }
    );
    const res = await postPodcastOutline(req);
    expect(res.status).toBe(401);
  });

  it("propagates loadDraftContentJson errors for social snippets", async () => {
    mockLoadDraftContentJson.mockResolvedValueOnce({
      ok: false,
      error: "Draft not found",
      Status: 404,
    });

    const req = makeJsonRequest(
      "http://localhost:3000/api/content-products/social-snippets",
      { draftId: "missing-draft" }
    );
    const res = await postSocialSnippets(req);
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error).toBe("Draft not found");
    expect(mockLoadDraftContentJson).toHaveBeenCalledWith(mockSupabase, "missing-draft", "ws-123");
  });

  it("uses content_json override and sanitizes social snippets output", async () => {
    mockClaudeCreate.mockResolvedValueOnce({
      content: [
        {
          type: "text",
          text: "```json\n{\"x_post\":\"Short post\",\"linkedin_teaser\":42,\"threads\":\"Thread body\"}\n```",
        },
      ],
    });

    const req = makeJsonRequest(
      "http://localhost:3000/api/content-products/social-snippets",
      {
        content_json: { title: "Override title" },
      }
    );
    const res = await postSocialSnippets(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.snippets).toEqual({
      x_post: "Short post",
      linkedin_teaser: "",
      threads: "Thread body",
    });
    expect(mockLoadDraftContentJson).not.toHaveBeenCalled();
    expect(mockDraftSummaryForContentProducts).toHaveBeenCalledWith({
      title: "Override title",
    });
  });

  it("returns 502 when podcast outline model output is invalid JSON", async () => {
    mockClaudeCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "not-json" }],
    });

    const req = makeJsonRequest(
      "http://localhost:3000/api/content-products/podcast-outline",
      { content_json: { title: "Override title" } }
    );
    const res = await postPodcastOutline(req);
    const json = await res.json();

    expect(res.status).toBe(502);
    expect(json.error).toContain("Failed to parse model output as JSON");
  });

  it("filters invalid podcast segments and beat values", async () => {
    mockClaudeCreate.mockResolvedValueOnce({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            working_title: "Episode title",
            hook: "Cold open",
            segments: [
              { title: "Segment A", beats: ["beat 1", 2, "beat 3"] },
              { title: 12, beats: ["nope"] },
              { title: "Segment B", beats: "not-array" },
            ],
            outro_cta: "Subscribe",
          }),
        },
      ],
    });

    const req = makeJsonRequest(
      "http://localhost:3000/api/content-products/podcast-outline",
      { content_json: { title: "Override title" } }
    );
    const res = await postPodcastOutline(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.outline).toEqual({
      working_title: "Episode title",
      hook: "Cold open",
      segments: [
        { title: "Segment A", beats: ["beat 1", "beat 3"] },
        { title: "Segment B", beats: [] },
      ],
      outro_cta: "Subscribe",
    });
  });

  it("returns 404 when there are no active revenue items", async () => {
    mockSupabase._setResult("revenue_items", { data: [], error: null });

    const req = makeJsonRequest(
      "http://localhost:3000/api/content-products/sponsorship-alignment",
      { content_json: { title: "Override title" } }
    );
    const res = await postSponsorshipAlignment(req);
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error).toContain("No active revenue items");
  });

  it("sanitizes sponsorship alignment when model picks invalid catalog id", async () => {
    mockSupabase._setResult("revenue_items", {
      data: [
        {
          id: "rev-1",
          type: "sponsorship",
          title: "Offer 1",
          description: "Desc 1",
          priority_score: 0.8,
          active: true,
        },
      ],
      error: null,
    });
    mockClaudeCreate.mockResolvedValueOnce({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            recommended_item_id: "not-in-catalog",
            confidence: "very-high",
            rationale: "Not aligned.",
            suggested_mention: "Mention this.",
          }),
        },
      ],
    });

    const req = makeJsonRequest(
      "http://localhost:3000/api/content-products/sponsorship-alignment",
      { content_json: { title: "Override title" } }
    );
    const res = await postSponsorshipAlignment(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.alignment).toEqual({
      recommended_item_id: null,
      confidence: "low",
      rationale: "Not aligned.",
      suggested_mention: "Mention this.",
      catalog_invalid_id: true,
    });
  });
});
