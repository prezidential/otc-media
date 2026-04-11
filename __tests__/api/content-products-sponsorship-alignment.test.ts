import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabase, makeJsonRequest } from "./helpers";

const mockSupabase = createMockSupabase();
const mockClaudeCreate = vi.fn();
const mockLoadDraftContentJson = vi.fn();

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

import { POST } from "@/app/api/content-products/sponsorship-alignment/route";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("WORKSPACE_ID", "ws-123");
  mockLoadDraftContentJson.mockResolvedValue({
    ok: true,
    draftId: "draft-1",
    contentJson: {
      title: "Issue title",
      deep_dive: "Deep dive body",
    },
  });
  mockClaudeCreate.mockResolvedValue({
    content: [
      {
        type: "text",
        text: JSON.stringify({
          recommended_item_id: "item-1",
          confidence: "high",
          rationale: "Strong thematic fit",
          suggested_mention: "Mention premium access for operators.",
        }),
      },
    ],
  });
});

describe("POST /api/content-products/sponsorship-alignment", () => {
  it("returns 503 when WORKSPACE_ID is missing", async () => {
    vi.stubEnv("WORKSPACE_ID", "");

    const res = await POST(
      makeJsonRequest("http://localhost:3000/api/content-products/sponsorship-alignment", {
        content_json: { title: "x" },
      })
    );
    const json = await res.json();

    expect(res.status).toBe(503);
    expect(json.error).toBe("WORKSPACE_ID is not set");
    expect(mockSupabase.from).not.toHaveBeenCalled();
    expect(mockClaudeCreate).not.toHaveBeenCalled();
  });

  it("passes through loadDraft errors when no content override is provided", async () => {
    mockLoadDraftContentJson.mockResolvedValueOnce({
      ok: false,
      error: "draftId required",
      Status: 400,
    });

    const res = await POST(
      makeJsonRequest("http://localhost:3000/api/content-products/sponsorship-alignment", {
        draftId: "",
      })
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("draftId required");
    expect(mockSupabase.from).not.toHaveBeenCalled();
    expect(mockClaudeCreate).not.toHaveBeenCalled();
  });

  it("returns 500 when revenue item lookup fails", async () => {
    mockSupabase._setResult("revenue_items", {
      data: null,
      error: { message: "db unavailable" },
    });

    const res = await POST(
      makeJsonRequest("http://localhost:3000/api/content-products/sponsorship-alignment", {
        content_json: { title: "x" },
      })
    );
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toBe("db unavailable");
    expect(mockClaudeCreate).not.toHaveBeenCalled();
  });

  it("returns 404 when there are no active revenue items", async () => {
    mockSupabase._setResult("revenue_items", {
      data: [],
      error: null,
    });

    const res = await POST(
      makeJsonRequest("http://localhost:3000/api/content-products/sponsorship-alignment", {
        content_json: { title: "x" },
      })
    );
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error).toBe("No active revenue items to align");
    expect(mockClaudeCreate).not.toHaveBeenCalled();
  });

  it("returns 502 when model output is not parseable JSON", async () => {
    mockSupabase._setResult("revenue_items", {
      data: [
        {
          id: "item-1",
          type: "sponsorship",
          title: "Premium placement",
          description: "High intent placement for identity teams.",
          priority_score: 0.9,
          active: true,
        },
      ],
      error: null,
    });
    mockClaudeCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "this is not valid json" }],
    });

    const res = await POST(
      makeJsonRequest("http://localhost:3000/api/content-products/sponsorship-alignment", {
        content_json: { title: "x" },
      })
    );
    const json = await res.json();

    expect(res.status).toBe(502);
    expect(json.ok).toBe(false);
    expect(json.error).toBe("Failed to parse model output as JSON");
  });

  it("nulls invalid catalog IDs and normalizes confidence", async () => {
    mockSupabase._setResult("revenue_items", {
      data: [
        {
          id: "item-1",
          type: "sponsorship",
          title: "Premium placement",
          description: "High intent placement for identity teams.",
          priority_score: 0.9,
          active: true,
        },
      ],
      error: null,
    });
    mockClaudeCreate.mockResolvedValueOnce({
      content: [
        {
          type: "text",
          text: `\`\`\`json
{"recommended_item_id":"not-in-catalog","confidence":"certain","rationale":"Some reason","suggested_mention":"Use this mention."}
\`\`\``,
        },
      ],
    });

    const res = await POST(
      makeJsonRequest("http://localhost:3000/api/content-products/sponsorship-alignment", {
        content_json: { title: "x" },
      })
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.alignment.recommended_item_id).toBeNull();
    expect(json.alignment.confidence).toBe("low");
    expect(json.alignment.catalog_invalid_id).toBe(true);
    expect(json.alignment.rationale).toBe("Some reason");
    expect(json.alignment.suggested_mention).toBe("Use this mention.");
  });
});
