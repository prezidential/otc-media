import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

// Identity-ish crypto so we can assert tokens are run through encrypt/decrypt.
vi.mock("@/lib/integrations/beehiiv/crypto", () => ({
  encryptToken: (s: string) => `enc(${s})`,
  decryptToken: (s: string) => s.replace(/^enc\(/, "").replace(/\)$/, ""),
}));

import { upsertBeehiivConnection, getBeehiivConnection } from "@/lib/integrations/beehiiv/store";

describe("beehiiv store", () => {
  it("upsert encrypts tokens and returns the id", async () => {
    let captured: Record<string, unknown> = {};
    const maybeSingle = vi.fn().mockResolvedValue({ data: { id: "conn-1" }, error: null });
    const upsert = vi.fn((row: Record<string, unknown>) => {
      captured = row;
      return { select: () => ({ maybeSingle }) };
    });
    const supabase = { from: vi.fn(() => ({ upsert })) } as unknown as SupabaseClient;

    const res = await upsertBeehiivConnection(supabase, {
      workspaceId: "ws", userId: "u", providerUserId: "pub_x",
      accessToken: "atoken", refreshToken: "rtoken", expiresAt: "2026-06-07T00:00:00Z", scope: "read", profileJson: {},
    });

    expect(res).toEqual({ ok: true, id: "conn-1" });
    expect(captured.access_token).toBe("enc(atoken)");
    expect(captured.refresh_token).toBe("enc(rtoken)");
    expect(captured.user_id).toBe("u");
  });

  it("upsert leaves a null refresh token null", async () => {
    let captured: Record<string, unknown> = {};
    const supabase = {
      from: vi.fn(() => ({
        upsert: (row: Record<string, unknown>) => {
          captured = row;
          return { select: () => ({ maybeSingle: () => Promise.resolve({ data: { id: "c" }, error: null }) }) };
        },
      })),
    } as unknown as SupabaseClient;
    await upsertBeehiivConnection(supabase, {
      workspaceId: "ws", userId: "u", providerUserId: "p", accessToken: "a", refreshToken: null,
      expiresAt: "x", scope: "read", profileJson: {},
    });
    expect(captured.refresh_token).toBeNull();
  });

  it("get decrypts tokens", async () => {
    const row = { id: "1", workspace_id: "ws", user_id: "u", provider_user_id: "pub_x", access_token: "enc(tok)", refresh_token: "enc(ref)", expires_at: "z", scope: "read", profile_json: {}, created_at: "", updated_at: "" };
    const maybeSingle = vi.fn().mockResolvedValue({ data: row, error: null });
    const chain = { select: () => ({ eq: () => ({ eq: () => ({ order: () => ({ limit: () => ({ maybeSingle }) }) }) }) }) };
    const supabase = { from: vi.fn(() => chain) } as unknown as SupabaseClient;

    const got = await getBeehiivConnection(supabase, { workspaceId: "ws", userId: "u" });
    expect(got?.access_token).toBe("tok");
    expect(got?.refresh_token).toBe("ref");
  });

  it("get returns null on error", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: { message: "x" } });
    const chain = { select: () => ({ eq: () => ({ eq: () => ({ order: () => ({ limit: () => ({ maybeSingle }) }) }) }) }) };
    const supabase = { from: vi.fn(() => chain) } as unknown as SupabaseClient;
    expect(await getBeehiivConnection(supabase, { workspaceId: "ws", userId: "u" })).toBeNull();
  });
});
