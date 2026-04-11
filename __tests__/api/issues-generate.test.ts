import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabase, makeJsonRequest } from "./helpers";

const mockSupabase = createMockSupabase();
const mockCallLLM = vi.fn().mockResolvedValue({ text: "{}", provider: "anthropic", model: "claude-test" });

vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => mockSupabase,
}));

vi.mock("@/lib/llm/provider", () => ({
  callLLM: (...args: unknown[]) => mockCallLLM(...args),
  getModelForRole: () => ({ provider: "anthropic", model: "claude-test" }),
}));

import { POST } from "@/app/api/issues/generate/route";

function setCommonDbFixtures() {
  mockSupabase._setResult("brand_profiles", {
    data: {
      id: "bp-1",
      name: "Identity Jedi",
      voice_rules_json: {},
      formatting_rules_json: {},
      forbidden_patterns_json: [],
      cta_rules_json: {},
      emoji_policy_json: {},
      narrative_preferences_json: {},
    },
    error: null,
  });

  mockSupabase._setResult("editorial_leads", {
    data: [
      {
        id: "lead-1",
        angle: "Credential boundaries are dissolving",
        why_now: "Agentic workflows are now in production",
        who_it_impacts: "Identity engineering teams",
        contrarian_take: "Most teams are classifying automation as humans.\n\nSources:\n- https://example.com/signal-1",
        created_at: "2026-03-10T00:00:00Z",
      },
    ],
    error: null,
  });

  mockSupabase._setResult("issue_drafts", {
    data: [
      { content_json: { title: "Previous One" } },
      { content_json: { title: "Previous Two" } },
      { content_json: { title: 123 } },
    ],
    error: null,
  });
}

function setCommonClaudeResponses(editorialAngleText: string) {
  const curationResponse = {
    selected: [1],
    rationale: "Single approved lead available for this run.",
  };

  const thesisResponse = {
    theses: [
      {
        id: "t1",
        thesis: "Identity boundaries collapse when automation inherits human trust.",
        scores: { distinctiveness: 3, tension: 3, operator_usefulness: 3, mode_fit: 3 },
        total: 12,
      },
      {
        id: "t2",
        thesis: "Teams lose control when machine actors share human identity policy.",
        scores: { distinctiveness: 4, tension: 4, operator_usefulness: 5, mode_fit: 5 },
        total: 18,
      },
      {
        id: "t3",
        thesis: "Access failures accelerate when automation is treated as a user.",
        scores: { distinctiveness: 2, tension: 3, operator_usefulness: 3, mode_fit: 2 },
        total: 10,
      },
    ],
    selected_id: "t2",
  };

  const draftSections = {
    title: "Control Fails Quietly",
    hook_paragraphs: ["Something just changed.", "Identity assumptions no longer hold."],
    fresh_signals:
      "**Fresh Signals**\n\n**Signal One**\n\nPolicy drift is widening.\n\nSources:\n- https://example.com/signal-1",
    deep_dive: "Identity control fails when policy models lag behind machine behavior.",
    dojo_checklist: [
      "Separate machine identity classes.",
      "Require explicit machine policy.",
      "Add machine behavior audits.",
      "Constrain machine lateral movement.",
      "Review machine grants weekly.",
    ],
  };

  mockCallLLM
    .mockResolvedValueOnce({ text: JSON.stringify(curationResponse), provider: "anthropic", model: "claude-test" })
    .mockResolvedValueOnce({ text: JSON.stringify(thesisResponse), provider: "anthropic", model: "claude-test" })
    .mockResolvedValueOnce({ text: editorialAngleText, provider: "anthropic", model: "claude-test" })
    .mockResolvedValueOnce({ text: JSON.stringify(draftSections), provider: "anthropic", model: "claude-test" });
}

beforeEach(() => {
  vi.stubEnv("WORKSPACE_ID", "ws-123");
  vi.clearAllMocks();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue({ ok: true, promoText: "Subscribe." }),
    })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("POST /api/issues/generate", () => {
  it("parses fenced editorial-angle JSON and injects previous titles into prompt", async () => {
    setCommonDbFixtures();
    setCommonClaudeResponses(`\`\`\`json
{
  "title": "Fenced Angle Title",
  "hook_line": "A boundary just shifted",
  "hook_paragraphs": ["One short paragraph.", "Second short paragraph."],
  "deep_dive_thesis": "Identity policy breaks when machine identities are misclassified.",
  "uncomfortable_truth": "Most identity programs are built for users, not machines.",
  "reframe": "This is a classification failure before it is a tooling failure.",
  "deep_dive_outline": ["Point one", "Point two", "Point three", "Point four", "Point five"],
  "dojo_checklist": ["Item one", "Item two", "Item three", "Item four", "Item five"]
}
\`\`\``);

    const req = makeJsonRequest("http://localhost:3000/api/issues/generate", {
      brandProfileId: "bp-1",
    });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(mockCallLLM).toHaveBeenCalledTimes(4);

    const angleMessages = mockCallLLM.mock.calls[2][1] as Array<{ role: string; content: string }>;
    const angleUserMsg = angleMessages.find((m) => m.role === "user")?.content ?? "";
    expect(angleUserMsg).toContain(
      'Do NOT reuse any of these previous titles: "Previous One", "Previous Two"'
    );

    const draftMessages = mockCallLLM.mock.calls[3][1] as Array<{ role: string; content: string }>;
    const draftUserMsg = draftMessages.find((m) => m.role === "user")?.content ?? "";
    expect(draftUserMsg).toContain("Title: Fenced Angle Title");
  });

  it("fails fast when editorial-angle payload is not valid JSON", async () => {
    setCommonDbFixtures();
    setCommonClaudeResponses("not-json");

    const req = makeJsonRequest("http://localhost:3000/api/issues/generate", {
      brandProfileId: "bp-1",
    });

    await expect(POST(req)).rejects.toThrow(
      "Editorial angle generation failed to produce valid JSON"
    );
    expect(mockCallLLM).toHaveBeenCalledTimes(3);
  });

  it("returns 400 when newsletter outline is disabled", async () => {
    mockSupabase._setResult("brand_profiles", {
      data: {
        id: "bp-1",
        name: "Identity Jedi",
        voice_rules_json: {},
        formatting_rules_json: {},
        forbidden_patterns_json: [],
        cta_rules_json: {},
        emoji_policy_json: {},
        narrative_preferences_json: {},
      },
      error: null,
    });
    mockSupabase._setResult("content_outlines", {
      data: {
        id: "outline-disabled",
        kind: "newsletter_issue",
        disabled_at: "2026-03-10T00:00:00Z",
      },
      error: null,
    });

    const req = makeJsonRequest("http://localhost:3000/api/issues/generate", {
      brandProfileId: "bp-1",
      contentOutlineId: "outline-disabled",
      outputMode: "full_issue",
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toContain("outline is disabled");
    expect(mockCallLLM).not.toHaveBeenCalled();
  });

  it("returns 400 when insider outline kind mismatches insider generation", async () => {
    mockSupabase._setResult("brand_profiles", {
      data: {
        id: "bp-1",
        name: "Identity Jedi",
        voice_rules_json: {},
        formatting_rules_json: {},
        forbidden_patterns_json: [],
        cta_rules_json: {},
        emoji_policy_json: {},
        narrative_preferences_json: {},
      },
      error: null,
    });
    mockSupabase._setResult("content_outlines", {
      data: {
        id: "outline-newsletter",
        kind: "newsletter_issue",
        disabled_at: null,
      },
      error: null,
    });

    const req = makeJsonRequest("http://localhost:3000/api/issues/generate", {
      brandProfileId: "bp-1",
      insiderContentOutlineId: "outline-newsletter",
      outputMode: "insider_access",
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toContain("kind does not match");
    expect(mockCallLLM).not.toHaveBeenCalled();
  });
});
