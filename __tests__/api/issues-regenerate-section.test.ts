import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockClaudeClient, createMockSupabase, makeJsonRequest } from "./helpers";
import type { DraftContentJson } from "@/lib/draft/content";
import type { LintViolation } from "@/lib/draft/lint";

const mockSupabase = createMockSupabase();
const mockClaude = createMockClaudeClient();

vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => mockSupabase,
}));

vi.mock("@/lib/llm/claude", () => ({
  claudeClient: () => mockClaude,
}));

vi.mock("@/lib/draft/lint", () => ({
  applyDashReplaceMap: vi.fn((text: string) => text),
  lintDraft: vi.fn(() => []),
  rewriteLintViolations: vi.fn(async (text: string) => text),
}));

import { lintDraft, rewriteLintViolations } from "@/lib/draft/lint";
import { POST } from "@/app/api/issues/regenerate-section/route";

const mockLintDraft = vi.mocked(lintDraft);
const mockRewriteLintViolations = vi.mocked(rewriteLintViolations);

function makeContentJson(overrides: Partial<DraftContentJson> = {}): DraftContentJson {
  return {
    title: "Identity under pressure",
    hook_paragraphs: ["Opening paragraph one.", "Opening paragraph two."],
    fresh_signals: "**Fresh Signals**\n\nSignal text.\n\nSources:\n- https://example.com/signal",
    deep_dive: "Deep dive body.",
    dojo_checklist: ["Current checklist item"],
    promo_slot: "",
    close: "Close line.",
    sources: ["https://example.com/signal"],
    metadata: {
      thesis: "Machine identities need explicit governance.",
      model: "claude-sonnet-4",
    },
    ...overrides,
  };
}

function setCommonFixtures() {
  const content = `1) Title
Identity under pressure

2) Opening Hook
Opening paragraph one.

3) Fresh Signals
**Fresh Signals**

Signal text.

Sources:
- https://example.com/signal

4) Deep Dive
Deep dive body.

5) From the Dojo
- Current checklist item`;

  mockSupabase._setResult("issue_drafts", {
    data: {
      id: "draft-1",
      content,
      content_json: makeContentJson(),
      brand_profile_id: "bp-1",
    },
    error: null,
  });

  mockSupabase._setResult("brand_profiles", {
    data: {
      id: "bp-1",
      name: "Identity Jedi",
      voice_rules_json: { tone: "direct" },
      formatting_rules_json: {},
      forbidden_patterns_json: [],
      emoji_policy_json: {},
      narrative_preferences_json: {},
    },
    error: null,
  });

  mockSupabase._setResult("editorial_leads", {
    data: [
      {
        id: "lead-1",
        angle: "Agent identities are overtrusted",
        why_now: "Autonomous workflows are in production",
        who_it_impacts: "Identity platform owners",
        contrarian_take: "Most machine grants are invisible.\n\nSources:\n- https://example.com/lead",
        created_at: "2026-03-18T00:00:00Z",
      },
    ],
    error: null,
  });
}

beforeEach(() => {
  vi.stubEnv("WORKSPACE_ID", "ws-123");
  vi.clearAllMocks();
  mockLintDraft.mockReturnValue([]);
  mockRewriteLintViolations.mockResolvedValue("rewritten");
});

describe("POST /api/issues/regenerate-section", () => {
  it("returns 400 for unsupported section values", async () => {
    const req = makeJsonRequest("http://localhost:3000/api/issues/regenerate-section", {
      draftId: "draft-1",
      section: "fresh_signals",
    });
    const res = await POST(req);

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: "section required: one of title, hook, deep_dive, dojo_checklist",
    });
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  it("normalizes regenerated dojo checklist bullets before persisting", async () => {
    setCommonFixtures();
    mockClaude.messages.create = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "- Rotate API keys\n* Restrict machine grants\nMonitor drift" }],
    });

    const req = makeJsonRequest("http://localhost:3000/api/issues/regenerate-section", {
      draftId: "draft-1",
      section: "dojo_checklist",
      instruction: "Tighten the checklist for operators.",
    });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.content_json.dojo_checklist).toEqual([
      "Rotate API keys",
      "Restrict machine grants",
      "Monitor drift",
    ]);

    const issueDraftChain = mockSupabase._chains.get("issue_drafts");
    expect(issueDraftChain?.update).toHaveBeenCalledTimes(1);

    const updatePayload = vi.mocked(issueDraftChain!.update).mock.calls[0][0] as {
      content: string;
      content_json: DraftContentJson;
    };
    expect(updatePayload.content_json.dojo_checklist).toEqual([
      "Rotate API keys",
      "Restrict machine grants",
      "Monitor drift",
    ]);
    expect(updatePayload.content).toContain("• Rotate API keys");
    expect(updatePayload.content).toContain("• Restrict machine grants");
  });

  it("returns 422 after lint retries are exhausted and skips DB update", async () => {
    setCommonFixtures();
    const violation: LintViolation = {
      type: "forbidden_phrase",
      snippet: "the real risk is",
      lineNumber: 1,
    };

    mockClaude.messages.create = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "the real risk is invisible automation drift" }],
    });
    mockLintDraft.mockReturnValue([violation]);
    mockRewriteLintViolations.mockResolvedValue("still violating copy");

    const req = makeJsonRequest("http://localhost:3000/api/issues/regenerate-section", {
      draftId: "draft-1",
      section: "title",
    });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(422);
    expect(json.ok).toBe(false);
    expect(json.error).toContain("still has lint violations");
    expect(json.violations).toEqual([violation]);
    expect(mockRewriteLintViolations).toHaveBeenCalledTimes(2);

    const issueDraftChain = mockSupabase._chains.get("issue_drafts");
    expect(issueDraftChain?.update).not.toHaveBeenCalled();
  });
});
