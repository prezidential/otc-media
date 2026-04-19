import { describe, it, expect, vi, beforeEach } from "vitest";

const { runAceMock } = vi.hoisted(() => ({ runAceMock: vi.fn() }));
vi.mock("@/lib/ace/orchestrator", () => ({ runAce: runAceMock }));

import { POST } from "@/app/api/ace/cron/route";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("WORKSPACE_ID", "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
});

describe("POST /api/ace/cron", () => {
  it("returns 401 without bearer CRON_SECRET", async () => {
    vi.stubEnv("CRON_SECRET", "secret");
    const res = await POST(new Request("http://localhost/api/ace/cron", { method: "POST" }));
    expect(res.status).toBe(401);
  });

  it("returns 200 skipped when ACE_ENABLED is not true", async () => {
    vi.stubEnv("CRON_SECRET", "secret");
    vi.stubEnv("ACE_ENABLED", "false");
    const res = await POST(
      new Request("http://localhost/api/ace/cron", {
        method: "POST",
        headers: { Authorization: "Bearer secret" },
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.skipped).toBe(true);
    expect(runAceMock).not.toHaveBeenCalled();
  });

  it("calls runAce when ACE_ENABLED is true", async () => {
    vi.stubEnv("CRON_SECRET", "secret");
    vi.stubEnv("ACE_ENABLED", "true");
    runAceMock.mockResolvedValueOnce({ runId: "r1", status: "skipped", summary: "test" });
    const res = await POST(
      new Request("http://localhost/api/ace/cron", {
        method: "POST",
        headers: { Authorization: "Bearer secret" },
      })
    );
    expect(res.status).toBe(200);
    expect(runAceMock).toHaveBeenCalledWith({
      workspaceId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      trigger: "cron",
    });
    const json = await res.json();
    expect(json.ok).toBe(true);
  });
});
