import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockSupabase, makeJsonRequest } from "./helpers";

const mockSupabase = createMockSupabase();
const mockCallLLM = vi.fn().mockResolvedValue({ text: "Get deeper IAM content.\n\nSubscribe.", provider: "anthropic", model: "claude-test" });

vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => mockSupabase,
}));
vi.mock("@/lib/llm/provider", () => ({
  callLLM: (...args: unknown[]) => mockCallLLM(...args),
  getModelForRole: () => ({ provider: "anthropic", model: "claude-test" }),
}));

import { POST } from "@/app/api/revenue/recommend/route";

beforeEach(() => {
  vi.stubEnv("WORKSPACE_ID", "ws-123");
  vi.clearAllMocks();
});

describe("POST /api/revenue/recommend", () => {
  it("returns 400 when brandProfileId is missing", async () => {
    const req = makeJsonRequest("http://localhost:3000/api/revenue/recommend", {});
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("brandProfileId required");
  });

  it("returns 404 when brand profile not found", async () => {
    mockSupabase._setResult("brand_profiles", { data: null, error: null });

    const req = makeJsonRequest("http://localhost:3000/api/revenue/recommend", {
      brandProfileId: "bp-1",
    });
    const res = await POST(req);
    expect(res.status).toBe(404);
  });

  it("returns 404 when no active revenue item found", async () => {
    mockSupabase._setResult("brand_profiles", {
      data: { id: "bp-1", name: "Test", forbidden_patterns_json: [] },
      error: null,
    });
    const revenueChain = mockSupabase._setResult("revenue_items", { data: [], error: null });
    revenueChain.limit = vi.fn().mockResolvedValue({ data: [], error: null });

    const req = makeJsonRequest("http://localhost:3000/api/revenue/recommend", {
      brandProfileId: "bp-1",
    });
    const res = await POST(req);
    expect(res.status).toBe(404);
  });

  it("generates promo text for a valid request", async () => {
    mockSupabase._setResult("brand_profiles", {
      data: {
        id: "bp-1",
        name: "Identity Jedi",
        forbidden_patterns_json: [],
        emoji_policy_json: {},
        formatting_rules_json: {},
        cta_rules_json: {},
      },
      error: null,
    });
    const revenueChain = mockSupabase._setResult("revenue_items", {
      data: [{ id: "r-1", type: "premium", title: "Premium", description: "Desc", priority_score: 0.9, link: null, active: true, start_date: null, end_date: null }],
      error: null,
    });
    revenueChain.limit = vi.fn().mockResolvedValue({
      data: [{ id: "r-1", type: "premium", title: "Premium", description: "Desc", priority_score: 0.9, link: null, active: true, start_date: null, end_date: null }],
      error: null,
    });

    mockCallLLM.mockResolvedValue({ text: "Get deeper IAM content.\n\nSubscribe.", provider: "anthropic", model: "claude-test" });

    const req = makeJsonRequest("http://localhost:3000/api/revenue/recommend", {
      brandProfileId: "bp-1",
    });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.promoText).toContain("Subscribe.");
    expect(json.item.title).toBe("Premium");
  });
});
