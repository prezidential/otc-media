import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockSupabase, makeJsonRequest } from "./helpers";

const { runAceMock } = vi.hoisted(() => ({ runAceMock: vi.fn() }));
vi.mock("@/lib/ace/orchestrator", () => ({ runAce: runAceMock }));

const mockSupabase = createMockSupabase();
const ctx = { supabase: mockSupabase, workspaceId: "ws-user", userId: "u1", role: "owner" as const };
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => mockSupabase,
  supabaseUser: async () => mockSupabase,
}));
vi.mock("@/lib/auth/session", () => ({
  requireWorkspace: vi.fn(async () => ctx),
}));

import { POST } from "@/app/api/ace/run/route";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/ace/run", () => {
  it("user-initiated: resolves workspace via requireWorkspace and uses manual trigger", async () => {
    runAceMock.mockResolvedValueOnce({ runId: "r1", status: "completed", summary: "done" });
    const req = makeJsonRequest("http://localhost/api/ace/run", { forceRerun: true });
    const res = await POST(req);
    expect(runAceMock).toHaveBeenCalledWith({
      workspaceId: "ws-user",
      trigger: "manual",
      forceRerun: true,
    });
    const json = await res.json();
    expect(json.status).toBe("completed");
  });

  it("internal call: accepts workspaceId in body when CRON_SECRET bearer matches", async () => {
    vi.stubEnv("CRON_SECRET", "secret");
    runAceMock.mockResolvedValueOnce({ runId: "r2", status: "skipped", summary: "" });

    const req = new Request("http://localhost/api/ace/run", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer secret",
      },
      body: JSON.stringify({ workspaceId: "ws-internal", forceRerun: false }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(runAceMock).toHaveBeenCalledWith({
      workspaceId: "ws-internal",
      trigger: "cron",
      forceRerun: false,
    });
  });

  it("internal call: returns 400 when bearer matches but workspaceId is missing", async () => {
    vi.stubEnv("CRON_SECRET", "secret");
    const req = new Request("http://localhost/api/ace/run", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer secret",
      },
      body: JSON.stringify({}),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(runAceMock).not.toHaveBeenCalled();
  });
});
