import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockSupabase, makeRequest, makeJsonRequest } from "./helpers";

const mockSupabase = createMockSupabase();
const ctx = { supabase: mockSupabase, workspaceId: "ws-123", userId: "user-1", role: "owner" };
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => mockSupabase,
  supabaseUser: async () => mockSupabase,
}));
vi.mock("@/lib/auth/session", () => ({
  requireWorkspace: vi.fn(async () => ctx),
}));

import { GET } from "@/app/api/brand-profiles/list/route";
import { POST as POST_SEED } from "@/app/api/brand-profiles/seed/route";
import { POST as POST_CREATE } from "@/app/api/brand-profiles/create/route";
import { GET as GET_ONE, PATCH as PATCH_ONE } from "@/app/api/brand-profiles/[id]/route";

const validCreateBody = {
  name: "New Brand",
  voice_rules_json: {},
  formatting_rules_json: {},
  forbidden_patterns_json: [],
  cta_rules_json: {},
  emoji_policy_json: {},
  narrative_preferences_json: {},
};

beforeEach(() => {
  vi.stubEnv("WORKSPACE_ID", "ws-123");
  vi.clearAllMocks();
});

describe("GET /api/brand-profiles/list", () => {
  it("returns brand profiles", async () => {
    const profiles = [{ id: "bp-1", name: "Identity Jedi Newsletter" }];
    mockSupabase._setResult("brand_profiles", { data: profiles, error: null });
    mockSupabase._setResult("workspace_settings", { data: null, error: null });

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.brandProfiles).toEqual(profiles);
    expect(json.defaultBrandProfileId).toBeNull();
  });

  it("returns defaultBrandProfileId when workspace_settings has a row", async () => {
    const profiles = [{ id: "bp-1", name: "A" }];
    mockSupabase._setResult("brand_profiles", { data: profiles, error: null });
    mockSupabase._setResult("workspace_settings", {
      data: { default_brand_profile_id: "bp-1" },
      error: null,
    });

    const res = await GET();
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.defaultBrandProfileId).toBe("bp-1");
  });

  it("returns 500 on error", async () => {
    mockSupabase._setResult("brand_profiles", { data: null, error: { message: "fail" } });

    const res = await GET();
    expect(res.status).toBe(500);
  });
});

describe("POST /api/brand-profiles/create", () => {
  it("returns 400 on invalid body", async () => {
    const res = await POST_CREATE(makeJsonRequest("http://x", { name: "" }));
    expect(res.status).toBe(400);
  });

  it("inserts and returns id", async () => {
    mockSupabase._setResult("brand_profiles", { data: { id: "new-bp" }, error: null });

    const res = await POST_CREATE(makeJsonRequest("http://x", validCreateBody));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.id).toBe("new-bp");
  });
});

describe("GET /api/brand-profiles/[id]", () => {
  it("returns 404 when not found", async () => {
    mockSupabase._setResult("brand_profiles", { data: null, error: null });

    const res = await GET_ONE(makeRequest("http://x"), {
      params: Promise.resolve({ id: "missing" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns profile", async () => {
    const row = {
      id: "bp-1",
      workspace_id: "ws-123",
      name: "N",
      voice_rules_json: {},
      formatting_rules_json: {},
      forbidden_patterns_json: [],
      cta_rules_json: {},
      emoji_policy_json: {},
      narrative_preferences_json: {},
      profile_version: "1.0",
      elevenlabs_voice_id: null,
      elevenlabs_model_id: null,
      created_at: "t",
    };
    mockSupabase._setResult("brand_profiles", { data: row, error: null });

    const res = await GET_ONE(makeRequest("http://x"), { params: Promise.resolve({ id: "bp-1" }) });
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.profile.id).toBe("bp-1");
    expect(json.profile.name).toBe("N");
  });
});

describe("PATCH /api/brand-profiles/[id]", () => {
  it("returns 404 when update matches no row", async () => {
    mockSupabase._setResult("brand_profiles", { data: null, error: null });

    const res = await PATCH_ONE(makeJsonRequest("http://x", validCreateBody), {
      params: Promise.resolve({ id: "missing" }),
    });
    expect(res.status).toBe(404);
  });

  it("updates and returns profile", async () => {
    const row = {
      id: "bp-1",
      workspace_id: "ws-123",
      name: "Updated",
      voice_rules_json: { x: 1 },
      formatting_rules_json: {},
      forbidden_patterns_json: [],
      cta_rules_json: {},
      emoji_policy_json: {},
      narrative_preferences_json: {},
      profile_version: "1.0",
      elevenlabs_voice_id: "v",
      elevenlabs_model_id: "m",
      created_at: "t",
    };
    mockSupabase._setResult("brand_profiles", { data: row, error: null });

    const res = await PATCH_ONE(
      makeJsonRequest("http://x", { ...validCreateBody, name: "Updated" }),
      { params: Promise.resolve({ id: "bp-1" }) }
    );
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.profile.name).toBe("Updated");
  });
});

describe("POST /api/brand-profiles/seed", () => {
  it("returns inserted: 0 when profiles already exist", async () => {
    const chain = mockSupabase._setResult("brand_profiles", {
      data: [{ id: "existing" }],
      error: null,
    });
    // Override the limit to return existing data
    chain.limit = vi.fn().mockResolvedValue({ data: [{ id: "existing" }], error: null });

    const res = await POST_SEED();
    const json = await res.json();

    expect(json.inserted).toBe(0);
  });

  it("returns 500 on fetch error", async () => {
    const chain = mockSupabase._setResult("brand_profiles", { data: null, error: null });
    chain.limit = vi.fn().mockResolvedValue({ data: null, error: { message: "fetch fail" } });

    const res = await POST_SEED();
    expect(res.status).toBe(500);
  });
});
