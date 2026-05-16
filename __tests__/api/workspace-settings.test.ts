import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockSupabase, makeJsonRequest } from "./helpers";

const mockSupabase = createMockSupabase();
const ctx = { supabase: mockSupabase, workspaceId: "ws-123", userId: "user-1", role: "owner" as const };
const { requireWorkspaceMock } = vi.hoisted(() => ({
  requireWorkspaceMock: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => mockSupabase,
  supabaseUser: async () => mockSupabase,
}));
vi.mock("@/lib/auth/session", () => ({
  requireWorkspace: requireWorkspaceMock,
}));

import { GET, PATCH } from "@/app/api/workspace/settings/route";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("WORKSPACE_ID", "ws-123");
  requireWorkspaceMock.mockImplementation(async () => ctx);
});

describe("GET /api/workspace/settings", () => {
  it("returns default id and updated_at", async () => {
    mockSupabase._setResult("workspace_settings", {
      data: { default_brand_profile_id: "bp-1", updated_at: "t0" },
      error: null,
    });

    const res = await GET();
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.defaultBrandProfileId).toBe("bp-1");
    expect(json.updated_at).toBe("t0");
  });

  it("returns null when no row", async () => {
    mockSupabase._setResult("workspace_settings", { data: null, error: null });

    const res = await GET();
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.defaultBrandProfileId).toBeNull();
    expect(json.updated_at).toBeNull();
  });

  it("returns 500 on select error", async () => {
    mockSupabase._setResult("workspace_settings", { data: null, error: { message: "db" } });

    const res = await GET();
    expect(res.status).toBe(500);
  });
});

describe("PATCH /api/workspace/settings", () => {
  it("returns 400 when defaultBrandProfileId missing", async () => {
    const res = await PATCH(makeJsonRequest("http://x", {}));
    expect(res.status).toBe(400);
  });

  it("returns 404 when profile id not in workspace", async () => {
    mockSupabase._setResult("brand_profiles", { data: null, error: null });

    const res = await PATCH(makeJsonRequest("http://x", { defaultBrandProfileId: "missing" }));
    expect(res.status).toBe(404);
  });

  it("upserts null default", async () => {
    mockSupabase._setResult("workspace_settings", { data: null, error: null });

    const res = await PATCH(makeJsonRequest("http://x", { defaultBrandProfileId: null }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.defaultBrandProfileId).toBeNull();
  });

  it("upserts profile id after workspace check", async () => {
    mockSupabase._setResult("brand_profiles", { data: { id: "bp-1" }, error: null });
    mockSupabase._setResult("workspace_settings", { data: null, error: null });

    const res = await PATCH(makeJsonRequest("http://x", { defaultBrandProfileId: "bp-1" }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.defaultBrandProfileId).toBe("bp-1");
  });

  it("returns auth error when requireWorkspace returns a Response", async () => {
    requireWorkspaceMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401 })
    );

    const res = await PATCH(
      makeJsonRequest("http://x", { defaultBrandProfileId: null })
    );
    expect(res.status).toBe(401);
  });
});
