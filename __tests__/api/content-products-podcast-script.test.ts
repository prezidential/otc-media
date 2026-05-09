import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabase, makeJsonRequest } from "./helpers";

const mockSupabase = createMockSupabase();
const mockClaudeCreate = vi.fn();
const mockLoadDraftContentJson = vi.fn();
const mockDraftSummaryForContentProducts = vi.fn();
const mockResolveSignalsForDraft = vi.fn();
const mockFormatSignalGroundingForPrompt = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => mockSupabase,
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

vi.mock("@/lib/content-products/resolveSignals", () => ({
  resolveSignalsForDraft: (...args: unknown[]) => mockResolveSignalsForDraft(...args),
  formatSignalGroundingForPrompt: (...args: unknown[]) =>
    mockFormatSignalGroundingForPrompt(...args),
}));

import { POST } from "@/app/api/content-products/podcast-script/route";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("WORKSPACE_ID", "ws-123");
  mockLoadDraftContentJson.mockResolvedValue({
    ok: true,
    draftId: "draft-1",
    contentJson: { title: "Issue title" },
  });
  mockDraftSummaryForContentProducts.mockReturnValue("Summarized draft context");
  mockResolveSignalsForDraft.mockResolvedValue({
    grounded: [{ id: "sig-1", url: "https://example.com", title: "Signal title", publisher: null, excerpt: null }],
    unmatchedUrls: ["https://unmatched.example"],
  });
  mockFormatSignalGroundingForPrompt.mockReturnValue("Formatted signal grounding");
});

describe("POST /api/content-products/podcast-script", () => {
  it("returns 503 when WORKSPACE_ID is missing", async () => {
    vi.stubEnv("WORKSPACE_ID", "");

    const res = await POST(
      makeJsonRequest("http://localhost:3000/api/content-products/podcast-script", {
        content_json: { title: "x" },
      })
    );
    const json = await res.json();

    expect(res.status).toBe(503);
    expect(json.error).toBe("WORKSPACE_ID is not set");
    expect(mockLoadDraftContentJson).not.toHaveBeenCalled();
    expect(mockClaudeCreate).not.toHaveBeenCalled();
  });

  it("passes through loadDraft errors when content override is absent", async () => {
    mockLoadDraftContentJson.mockResolvedValueOnce({
      ok: false,
      error: "Draft not found",
      Status: 404,
    });

    const res = await POST(
      makeJsonRequest("http://localhost:3000/api/content-products/podcast-script", {
        draftId: "missing-draft",
      })
    );
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error).toBe("Draft not found");
    expect(mockResolveSignalsForDraft).not.toHaveBeenCalled();
    expect(mockClaudeCreate).not.toHaveBeenCalled();
  });

  it("returns 502 when model output is not valid JSON", async () => {
    mockClaudeCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "not-json" }],
    });

    const res = await POST(
      makeJsonRequest("http://localhost:3000/api/content-products/podcast-script", {
        content_json: { title: "override title" },
      })
    );
    const json = await res.json();

    expect(res.status).toBe(502);
    expect(json.ok).toBe(false);
    expect(json.error).toBe("Failed to parse model output as JSON");
  });

  it("normalizes script shape and reports grounding counts", async () => {
    mockClaudeCreate.mockResolvedValueOnce({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            working_title: "  Episode title  ",
            estimated_runtime_minutes: 14.6,
            script_segments: [
              { id: "body_1", title: "Segment A", narrator_text: "  Segment A body  " },
              { id: "intro", title: "Intro", narrator_text: " Welcome intro " },
              { id: "", title: "No id", narrator_text: "  body fallback id  " },
              { id: "empty", narrator_text: "   " },
              { id: 123, narrator_text: " typed id fallback " },
              { id: "no_text", title: "Missing text" },
            ],
            sources_acknowledged: ["https://example.com", 42, "sig-1"],
            outro_cta: "  Subscribe for more  ",
          }),
        },
      ],
    });

    const res = await POST(
      makeJsonRequest("http://localhost:3000/api/content-products/podcast-script", {
        content_json: { title: "override title" },
      })
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.script).toEqual({
      working_title: "Episode title",
      estimated_runtime_minutes: 15,
      script_segments: [
        { id: "intro", title: "Intro", narrator_text: "Welcome intro" },
        { id: "body_1", title: "Segment A", narrator_text: "Segment A body" },
        { id: "seg_3", title: "No id", narrator_text: "body fallback id" },
        { id: "seg_5", narrator_text: "typed id fallback" },
      ],
      sources_acknowledged: ["https://example.com", "sig-1"],
      outro_cta: "Subscribe for more",
    });
    expect(json.grounding).toEqual({
      resolvedCount: 1,
      unmatchedCount: 1,
    });
    expect(mockLoadDraftContentJson).not.toHaveBeenCalled();
    expect(mockResolveSignalsForDraft).toHaveBeenCalledWith(
      mockSupabase,
      "ws-123",
      { title: "override title" }
    );
  });

  it("returns 502 when normalized script has no valid segments", async () => {
    mockClaudeCreate.mockResolvedValueOnce({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            working_title: "Episode title",
            script_segments: [{ id: "intro", narrator_text: "   " }],
            outro_cta: "bye",
          }),
        },
      ],
    });

    const res = await POST(
      makeJsonRequest("http://localhost:3000/api/content-products/podcast-script", {
        content_json: { title: "override title" },
      })
    );
    const json = await res.json();

    expect(res.status).toBe(502);
    expect(json.ok).toBe(false);
    expect(json.error).toBe("Model returned no script segments");
  });
});
