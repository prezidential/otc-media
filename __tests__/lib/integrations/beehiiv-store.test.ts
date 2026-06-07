import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { upsertBeehiivConnection, getBeehiivConnection } from "@/lib/integrations/beehiiv/store";

describe("beehiiv store", () => {
  it("upsert calls the RPC and returns the id", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: "conn-1", error: null });
    const supabase = { rpc } as unknown as SupabaseClient;
    const res = await upsertBeehiivConnection(supabase, {
      workspaceId: "ws", providerUserId: "pub_x", accessToken: "a", refreshToken: "r",
      expiresAt: "2026-06-07T00:00:00Z", scope: "read", profileJson: {},
    });
    expect(res).toEqual({ ok: true, id: "conn-1" });
    expect(rpc).toHaveBeenCalledWith("upsert_beehiiv_connection", expect.objectContaining({ p_workspace_id: "ws", p_access_token: "a" }));
  });

  it("upsert surfaces RPC errors", async () => {
    const supabase = { rpc: vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } }) } as unknown as SupabaseClient;
    const res = await upsertBeehiivConnection(supabase, {
      workspaceId: "ws", providerUserId: "p", accessToken: "a", refreshToken: null,
      expiresAt: "x", scope: "read", profileJson: {},
    });
    expect(res).toEqual({ ok: false, error: "boom" });
  });

  it("get reads the decrypted view by workspace+user", async () => {
    const row = { id: "1", workspace_id: "ws", user_id: "u", provider_user_id: "pub_x", access_token: "tok", refresh_token: "ref", expires_at: "z", scope: "read", profile_json: {}, created_at: "", updated_at: "" };
    const maybeSingle = vi.fn().mockResolvedValue({ data: row, error: null });
    const chain = { select: () => ({ eq: () => ({ eq: () => ({ order: () => ({ limit: () => ({ maybeSingle }) }) }) }) }) };
    const supabase = { from: vi.fn(() => chain) } as unknown as SupabaseClient;
    const got = await getBeehiivConnection(supabase, { workspaceId: "ws", userId: "u" });
    expect(got?.access_token).toBe("tok");
  });

  it("get returns null on error", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: { message: "x" } });
    const chain = { select: () => ({ eq: () => ({ eq: () => ({ order: () => ({ limit: () => ({ maybeSingle }) }) }) }) }) };
    const supabase = { from: vi.fn(() => chain) } as unknown as SupabaseClient;
    expect(await getBeehiivConnection(supabase, { workspaceId: "ws", userId: "u" })).toBeNull();
  });
});
