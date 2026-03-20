import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabase, makeJsonRequest } from "./helpers";

const mockSupabase = createMockSupabase();
const mockCallLLM = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => mockSupabase,
}));

vi.mock("@/lib/llm/provider", () => ({
  callLLM: (...args: unknown[]) => mockCallLLM(...args),
}));

import { POST } from "@/app/api/leads/generate/route";

function setCommonFixtures() {
  mockSupabase._setResult("brand_profiles", {
    data: {
      id: "bp-1",
      name: "Identity Jedi",
      voice_rules_json: { tone: "direct" },
      formatting_rules_json: {},
      forbidden_patterns_json: [],
      cta_rules_json: {},
      emoji_policy_json: {},
      narrative_preferences_json: {},
    },
    error: null,
  });

  mockSupabase._setResult("runs", {
    data: { id: "run-1" },
    error: null,
  });

  mockSupabase._setResult("signals", {
    data: [
      {
        id: "sig-1",
        directive_id: "dir-1",
        title: "Signal one",
        url: "https://example.com/s1",
        publisher: "Example News",
      },
      {
        id: "sig-2",
        directive_id: "dir-1",
        title: "Signal two",
        url: "https://example.com/s2",
        publisher: "Example Daily",
      },
    ],
    error: null,
  });

  mockSupabase._setResult("research_directives", {
    data: [{ id: "dir-1", name: "Directive A" }],
    error: null,
  });

  mockSupabase._setResult("editorial_leads", {
    data: [
      {
        angle: "Existing angle about identity controls failing in automation",
      },
    ],
    error: null,
  });
}

beforeEach(() => {
  vi.stubEnv("WORKSPACE_ID", "ws-123");
  vi.clearAllMocks();
});

describe("POST /api/leads/generate", () => {
  it("discards duplicate and invalid-source leads before insert", async () => {
    setCommonFixtures();

    mockCallLLM.mockResolvedValue({
      text: `\`\`\`json
{
  "directive": "Directive A",
  "leads": [
    {
      "angle": "Existing angle about identity controls failing in automation",
      "why_now": "Machine identities are increasing quickly in production workflows.",
      "who_it_impacts": "Security operators",
      "contrarian_take": "Most teams still govern automation like human users.",
      "confidence": 0.82,
      "sources": ["https://example.com/s1"]
    },
    {
      "angle": "Unique angle about identity drift in agent pipelines",
      "why_now": "Automated execution paths now write to critical systems directly.",
      "who_it_impacts": "Platform teams",
      "contrarian_take": "Control breaks first at integration boundaries, not endpoints.",
      "confidence": 0.74,
      "sources": ["https://example.com/s1", "https://example.com/s2"]
    },
    {
      "angle": "Angle with invalid citation URLs gets rejected early",
      "why_now": "Citation quality gates prevent unsupported editorial claims.",
      "who_it_impacts": "Content leads",
      "contrarian_take": "Unsupported citations can create false confidence in recommendations.",
      "confidence": 0.58,
      "sources": ["https://malicious.example/rogue"]
    }
  ]
}
\`\`\``,
      provider: "anthropic",
      model: "claude-test",
    });

    const req = makeJsonRequest("http://localhost:3000/api/leads/generate", {
      brandProfileId: "bp-1",
      days: 7,
    });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.directivesProcessed).toBe(1);
    expect(json.leadsInserted).toBe(1);
    expect(json.details).toEqual([
      {
        directive: "Directive A",
        inserted: 1,
        discarded: 2,
        discardedNote: "2 lead(s) discarded: 1 invalid sources, 1 duplicate angles",
      },
    ]);

    const editorialLeadsChain = mockSupabase._chains.get("editorial_leads");
    expect(editorialLeadsChain?.insert).toHaveBeenCalledTimes(1);
    expect(editorialLeadsChain?.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        angle: "Unique angle about identity drift in agent pipelines",
        status: "pending_review",
        contrarian_take: expect.stringContaining("Sources:\nhttps://example.com/s1\nhttps://example.com/s2"),
      })
    );
  });

  it("returns 422 and marks run failed when LLM output is schema-invalid", async () => {
    setCommonFixtures();

    mockCallLLM.mockResolvedValue({
      text: JSON.stringify({
        directive: "Directive A",
        leads: [
          {
            angle: "too short",
          },
        ],
      }),
      provider: "anthropic",
      model: "claude-test",
    });

    const req = makeJsonRequest("http://localhost:3000/api/leads/generate", {
      brandProfileId: "bp-1",
    });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(422);
    expect(json.ok).toBe(false);
    expect(json.error).toBe("Invalid Claude output");

    const runsChain = mockSupabase._chains.get("runs");
    expect(runsChain?.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        error_message: expect.stringContaining("Invalid Claude output"),
      })
    );
  });
});
