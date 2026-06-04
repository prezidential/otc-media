import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockSupabase } from "./helpers";

const mockSupabase = createMockSupabase();
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => mockSupabase,
}));

const runSubscriberHealth = vi.fn();
vi.mock("@/lib/subscriber-health/run", () => ({
  runSubscriberHealth: (...args: unknown[]) => runSubscriberHealth(...args),
}));

vi.mock("@/lib/ops/log", () => ({ opsLog: vi.fn() }));

import { GET, POST } from "@/app/api/pipelines/health-report/route";

function req(headers?: Record<string, string>): Request {
  return new Request("http://localhost/api/pipelines/health-report", { headers });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSupabase._chains.clear();
  vi.stubEnv("CRON_SECRET", "secret");
});

describe("auth", () => {
  it("returns 401 without bearer (GET)", async () => {
    const res = await GET(req());
    expect(res.status).toBe(401);
  });

  it("returns 401 with wrong bearer (POST)", async () => {
    const res = await POST(req({ authorization: "Bearer nope" }));
    expect(res.status).toBe(401);
  });

  it("returns 401 when CRON_SECRET is unset even with a bearer", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const res = await GET(req({ authorization: "Bearer secret" }));
    expect(res.status).toBe(401);
  });
});

describe("batch run", () => {
  const auth = { authorization: "Bearer secret" };

  it("iterates only subscriber_health_enabled workspaces (GET)", async () => {
    mockSupabase._setResult("workspace_settings", {
      data: [{ workspace_id: "ws-1" }, { workspace_id: "ws-2" }],
      error: null,
    });
    runSubscriberHealth.mockResolvedValue({ workspaceId: "ws", status: "completed", summary: "ok" });

    const res = await GET(req(auth));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.count).toBe(2);
    expect(runSubscriberHealth).toHaveBeenCalledWith({ workspaceId: "ws-1", trigger: "cron" });
    expect(runSubscriberHealth).toHaveBeenCalledWith({ workspaceId: "ws-2", trigger: "cron" });
  });

  it("works over POST too", async () => {
    mockSupabase._setResult("workspace_settings", { data: [{ workspace_id: "ws-1" }], error: null });
    runSubscriberHealth.mockResolvedValue({ workspaceId: "ws-1", status: "completed", summary: "ok" });

    const res = await POST(req(auth));
    expect(res.status).toBe(200);
    expect((await res.json()).count).toBe(1);
  });

  it("captures a per-workspace failure without aborting the batch", async () => {
    mockSupabase._setResult("workspace_settings", {
      data: [{ workspace_id: "ws-1" }, { workspace_id: "ws-2" }],
      error: null,
    });
    runSubscriberHealth
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({ workspaceId: "ws-2", status: "completed", summary: "ok" });

    const res = await GET(req(auth));
    const json = await res.json();

    expect(json.count).toBe(2);
    expect(json.results[0]).toMatchObject({ workspaceId: "ws-1", status: "failed" });
    expect(json.results[1]).toMatchObject({ workspaceId: "ws-2", status: "completed" });
  });

  it("returns count 0 when no workspaces are enabled", async () => {
    mockSupabase._setResult("workspace_settings", { data: [], error: null });
    const res = await GET(req(auth));
    const json = await res.json();
    expect(json).toEqual({ ok: true, count: 0, results: [] });
    expect(runSubscriberHealth).not.toHaveBeenCalled();
  });

  it("returns 500 when the workspace query fails", async () => {
    mockSupabase._setResult("workspace_settings", { data: null, error: { message: "db down" } });
    const res = await GET(req(auth));
    expect(res.status).toBe(500);
  });
});
