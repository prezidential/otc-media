import { vi } from "vitest";
import { createMockSupabase, type MockSupabaseChain } from "./helpers";

export type MockAuthCtx = {
  supabase: ReturnType<typeof createMockSupabase>;
  workspaceId: string;
  userId: string;
  role: "owner" | "editor" | "viewer";
};

/**
 * Stand up a fake `requireWorkspace()` return value for route tests.
 * Pair with `vi.mock("@/lib/auth/session", () => ({ requireWorkspace: () => ctx }))`
 * (or its variants) at the top of the test file.
 *
 * Cross-workspace isolation tests instead drive the real `requireWorkspace`
 * by hitting Supabase directly with two different JWTs.
 */
export function createAuthCtx(overrides: Partial<MockAuthCtx> = {}): MockAuthCtx {
  return {
    supabase: createMockSupabase(),
    workspaceId: "ws-123",
    userId: "user-1",
    role: "owner",
    ...overrides,
  };
}

export type { MockSupabaseChain };
