import { describe, it, expect, vi, beforeEach } from "vitest";
import { DEFAULT_LANES } from "@/lib/content-lanes/seed";

const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
const insert = vi.fn().mockResolvedValue({ error: null });

const chain: Record<string, ReturnType<typeof vi.fn>> = {};
chain.select = vi.fn(() => chain);
chain.eq = vi.fn(() => chain);
chain.maybeSingle = maybeSingle;
chain.insert = insert;

const from = vi.fn(() => chain);
const fakeSupabase = { from };
const ctx = {
  supabase: fakeSupabase,
  workspaceId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  userId: "user-1",
  role: "owner" as const,
};

vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => fakeSupabase,
  supabaseUser: async () => fakeSupabase,
}));
vi.mock("@/lib/auth/session", () => ({
  requireWorkspace: vi.fn(async () => ctx),
}));

import { POST } from "@/app/api/content-lanes/seed/route";

beforeEach(() => {
  vi.stubEnv("WORKSPACE_ID", "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
  vi.clearAllMocks();
  maybeSingle.mockResolvedValue({ data: null, error: null });
  insert.mockResolvedValue({ error: null });
});

describe("POST /api/content-lanes/seed", () => {
  it("inserts each default lane when none exist (idempotent first run)", async () => {
    const res = await POST();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.created).toHaveLength(DEFAULT_LANES.length);
    expect(json.skipped).toHaveLength(0);
    expect(insert).toHaveBeenCalledTimes(DEFAULT_LANES.length);
  });

  it("skips lanes that already exist", async () => {
    maybeSingle.mockResolvedValue({ data: { id: "existing" }, error: null });
    const res = await POST();
    const json = await res.json();
    expect(json.created).toHaveLength(0);
    expect(json.skipped).toHaveLength(DEFAULT_LANES.length);
    expect(insert).not.toHaveBeenCalled();
  });
});
