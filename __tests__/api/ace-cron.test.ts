import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockSupabase } from "./helpers";

const { runAceMock } = vi.hoisted(() => ({ runAceMock: vi.fn() }));
vi.mock("@/lib/ace/orchestrator", () => ({ runAce: runAceMock }));

const mockSupabase = createMockSupabase();
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => mockSupabase,
}));

import { POST } from "@/app/api/ace/cron/route";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/ace/cron", () => {
  it("returns 401 without bearer CRON_SECRET", async () => {
    vi.stubEnv("CRON_SECRET", "secret");
    const res = await POST(new Request("http://localhost/api/ace/cron", { method: "POST" }));
    expect(res.status).toBe(401);
  });

  it("returns 200 skipped when no workspace has ace_enabled=true", async () => {
    vi.stubEnv("CRON_SECRET", "secret");
    mockSupabase._setResult("workspace_settings", { data: [], error: null });

    const res = await POST(
      new Request("http://localhost/api/ace/cron", {
        method: "POST",
        headers: { Authorization: "Bearer secret" },
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.skipped).toBe(true);
    expect(runAceMock).not.toHaveBeenCalled();
  });

  it("returns 500 when workspace_settings query errors", async () => {
    vi.stubEnv("CRON_SECRET", "secret");
    mockSupabase._setResult("workspace_settings", { data: null, error: { message: "boom" } });

    const res = await POST(
      new Request("http://localhost/api/ace/cron", {
        method: "POST",
        headers: { Authorization: "Bearer secret" },
      })
    );
    expect(res.status).toBe(500);
    expect(runAceMock).not.toHaveBeenCalled();
  });

  it("calls runAce once per ace-enabled workspace", async () => {
    vi.stubEnv("CRON_SECRET", "secret");
    mockSupabase._setResult("workspace_settings", {
      data: [
        { workspace_id: "ws-aaa" },
        { workspace_id: "ws-bbb" },
      ],
      error: null,
    });
    runAceMock
      .mockResolvedValueOnce({ runId: "r1", status: "skipped", summary: "rec" })
      .mockResolvedValueOnce({ runId: "r2", status: "completed", summary: "ok" });

    const res = await POST(
      new Request("http://localhost/api/ace/cron", {
        method: "POST",
        headers: { Authorization: "Bearer secret" },
      })
    );
    expect(res.status).toBe(200);
    expect(runAceMock).toHaveBeenCalledTimes(2);
    expect(runAceMock).toHaveBeenNthCalledWith(1, { workspaceId: "ws-aaa", trigger: "cron" });
    expect(runAceMock).toHaveBeenNthCalledWith(2, { workspaceId: "ws-bbb", trigger: "cron" });

    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.count).toBe(2);
    expect(json.results).toHaveLength(2);
    expect(json.results[0].workspaceId).toBe("ws-aaa");
    expect(json.results[1].workspaceId).toBe("ws-bbb");
  });

  it("captures per-workspace failures without aborting the batch", async () => {
    vi.stubEnv("CRON_SECRET", "secret");
    mockSupabase._setResult("workspace_settings", {
      data: [
        { workspace_id: "ws-aaa" },
        { workspace_id: "ws-bbb" },
      ],
      error: null,
    });
    runAceMock
      .mockRejectedValueOnce(new Error("orchestrator boom"))
      .mockResolvedValueOnce({ runId: "r2", status: "completed", summary: "ok" });

    const res = await POST(
      new Request("http://localhost/api/ace/cron", {
        method: "POST",
        headers: { Authorization: "Bearer secret" },
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.results[0].result.status).toBe("failed");
    expect(json.results[0].result.error).toBe("orchestrator boom");
    expect(json.results[1].result.status).toBe("completed");
  });
});
