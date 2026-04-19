import { describe, it, expect, vi, beforeEach } from "vitest";

const from = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => ({ from }),
}));

import { runAce } from "@/lib/ace/orchestrator";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("WORKSPACE_ID", "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
});

describe("runAce", () => {
  it("returns skipped when ACE_ENABLED is not true (no DB writes)", async () => {
    vi.stubEnv("ACE_ENABLED", "false");
    const r = await runAce({
      workspaceId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      trigger: "manual",
    });
    expect(r.status).toBe("skipped");
    expect(r.summary).toContain("ACE disabled");
    expect(from).not.toHaveBeenCalled();
  });
});
