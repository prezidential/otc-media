import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeJsonRequest } from "./helpers";

const mockClaudeCreate = vi.fn();
const mockLoadDraftContentJson = vi.fn();
const mockDraftSummaryForContentProducts = vi.fn();
const mockResolveSignalsForDraft = vi.fn();
const mockFormatSignalGroundingForPrompt = vi.fn();
const mockSupabase = { marker: "supabase" };

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
  draftSummaryForContentProducts: (...args: unknown[]) => mockDraftSummaryForContentProducts(...args),
}));

vi.mock("@/lib/content-products/resolveSignals", () => ({
  resolveSignalsForDraft: (...args: unknown[]) => mockResolveSignalsForDraft(...args),
  formatSignalGroundingForPrompt: (...args: unknown[]) => mockFormatSignalGroundingForPrompt(...args),
}));

vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => mockSupabase,
}));

import { POST } from "@/app/api/content-products/podcast-script/route";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("WORKSPACE_ID", "ws-123");

  mockLoadDraftContentJson.mockResolvedValue({
    ok: true,
    draftId: "draft-1",
    contentJson: { title: "Default draft title" },
  });
  mockDraftSummaryForContentProducts.mockReturnValue("Summarized draft context");
  mockResolveSignalsForDraft.mockResolvedValue({
    grounded: [
      {
        id: "sig-1",
        url: "https://example.com/a",
        title: "Resolved signal",
        publisher: "Example",
        excerpt: "Signal excerpt",
      },
    ],
    unmatchedUrls: ["https://example.com/unmatched"],
  });
  mockFormatSignalGroundingForPrompt.mockReturnValue("GROUNDING BLOCK");
  mockClaudeCreate.mockResolvedValue({
    content: [
      {
        type: "text",
        text: JSON.stringify({
          working_title: "Episode",
          estimated_runtime_minutes: 12,
          script_segments: [{ id: "intro", narrator_text: "Welcome to the show." }],
          sources_acknowledged: ["sig-1"],
          outro_cta: "Thanks for listening.",
        }),
      },
    ],
  });
});

describe("POST /api/content-products/podcast-script", () => {
  it("normalizes model JSON and returns grounding counts", async () => {
    mockClaudeCreate.mockResolvedValueOnce({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            working_title: "  Weekly IAM  ",
            estimated_runtime_minutes: 14.6,
            script_segments: [
              { id: "seg_2", title: " Segment Two ", narrator_text: " body segment " },
              { id: "intro", title: " Intro ", narrator_text: " opening welcome " },
              { id: "", title: "No Id Segment", narrator_text: " with default id " },
              { id: "seg_bad", title: "Drop me", narrator_text: "   " },
              { title: 123, narrator_text: " another body segment " },
            ],
            sources_acknowledged: ["sig-1", 42, "https://example.com/unmatched"],
            outro_cta: "  See you next week.  ",
          }),
        },
      ],
    });

    const req = makeJsonRequest("http://localhost:3000/api/content-products/podcast-script", {
      draftId: "draft-1",
    });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.grounding).toEqual({
      resolvedCount: 1,
      unmatchedCount: 1,
    });
    expect(json.script).toEqual({
      working_title: "Weekly IAM",
      estimated_runtime_minutes: 15,
      script_segments: [
        { id: "intro", title: "Intro", narrator_text: "opening welcome" },
        { id: "seg_2", title: "Segment Two", narrator_text: "body segment" },
        { id: "seg_3", title: "No Id Segment", narrator_text: "with default id" },
        { id: "seg_5", narrator_text: "another body segment" },
      ],
      sources_acknowledged: ["sig-1", "https://example.com/unmatched"],
      outro_cta: "See you next week.",
    });

    expect(mockResolveSignalsForDraft).toHaveBeenCalledWith(mockSupabase, "ws-123", {
      title: "Default draft title",
    });
    expect(mockFormatSignalGroundingForPrompt).toHaveBeenCalledWith(
      [
        {
          id: "sig-1",
          url: "https://example.com/a",
          title: "Resolved signal",
          publisher: "Example",
          excerpt: "Signal excerpt",
        },
      ],
      ["https://example.com/unmatched"]
    );
    expect(mockClaudeCreate).toHaveBeenCalledTimes(1);
    const userPrompt = mockClaudeCreate.mock.calls[0][0].messages[0].content;
    expect(userPrompt).toContain("GROUNDING BLOCK");
  });

  it("uses content_json override instead of loading draft", async () => {
    const override = { title: "Override title", deep_dive: "Override body" };

    const req = makeJsonRequest("http://localhost:3000/api/content-products/podcast-script", {
      content_json: override,
    });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(mockLoadDraftContentJson).not.toHaveBeenCalled();
    expect(mockDraftSummaryForContentProducts).toHaveBeenCalledWith(override);
    expect(mockResolveSignalsForDraft).toHaveBeenCalledWith(mockSupabase, "ws-123", override);
  });

  it("returns 502 when model output is not parseable JSON", async () => {
    mockClaudeCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "not-json" }],
    });

    const req = makeJsonRequest("http://localhost:3000/api/content-products/podcast-script", {
      content_json: { title: "Override title" },
    });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(502);
    expect(json.ok).toBe(false);
    expect(json.error).toBe("Failed to parse model output as JSON");
  });

  it("returns 502 when normalized script has no segments", async () => {
    mockClaudeCreate.mockResolvedValueOnce({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            working_title: "Episode",
            script_segments: [{ id: "intro", narrator_text: "   " }],
            outro_cta: "Bye",
          }),
        },
      ],
    });

    const req = makeJsonRequest("http://localhost:3000/api/content-products/podcast-script", {
      content_json: { title: "Override title" },
    });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(502);
    expect(json.ok).toBe(false);
    expect(json.error).toBe("Model returned no script segments");
  });
});
