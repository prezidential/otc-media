import { describe, it, expect, vi, beforeEach } from "vitest";

const ctx = { workspaceId: "ws-1", userId: "u-1", role: "owner" as const, supabase: {} };
const requireWorkspace = vi.fn(async () => ctx as unknown);
vi.mock("@/lib/auth/session", () => ({
  requireWorkspace: () => requireWorkspace(),
}));

const runSubscriberHealth = vi.fn();
vi.mock("@/lib/subscriber-health/run", () => ({
  runSubscriberHealth: (...args: unknown[]) => runSubscriberHealth(...args),
}));

import { POST } from "@/app/api/pipelines/health-report/run/route";

beforeEach(() => {
  vi.clearAllMocks();
  requireWorkspace.mockResolvedValue(ctx as unknown);
});

describe("POST /api/pipelines/health-report/run", () => {
  it("runs the report for the caller's active workspace as a manual trigger", async () => {
    runSubscriberHealth.mockResolvedValue({ workspaceId: "ws-1", status: "completed", summary: "ok" });

    const res = await POST();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(runSubscriberHealth).toHaveBeenCalledWith({ workspaceId: "ws-1", trigger: "manual" });
    expect(json).toMatchObject({ status: "completed", summary: "ok" });
  });

  it("returns the skipped result when Beehiiv is not configured", async () => {
    runSubscriberHealth.mockResolvedValue({
      workspaceId: "ws-1",
      status: "skipped",
      summary: "Beehiiv not configured for workspace",
    });

    const res = await POST();
    expect((await res.json()).status).toBe("skipped");
  });

  it("propagates auth failures from requireWorkspace", async () => {
    requireWorkspace.mockResolvedValue(new Response(null, { status: 401 }));
    const res = await POST();
    expect(res.status).toBe(401);
    expect(runSubscriberHealth).not.toHaveBeenCalled();
  });
});
