import { describe, it, expect, vi, beforeEach } from "vitest";

const { runAceMock } = vi.hoisted(() => ({ runAceMock: vi.fn() }));
vi.mock("@/lib/ace/orchestrator", () => ({ runAce: runAceMock }));

import { POST } from "@/app/api/ace/run/route";
import { makeJsonRequest } from "./helpers";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("WORKSPACE_ID", "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
});

describe("POST /api/ace/run", () => {
  it("calls runAce with manual trigger and forceRerun", async () => {
    runAceMock.mockResolvedValueOnce({ runId: "r1", status: "completed", summary: "done" });
    const req = makeJsonRequest("http://localhost/api/ace/run", { forceRerun: true });
    const res = await POST(req);
    expect(runAceMock).toHaveBeenCalledWith({
      workspaceId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      trigger: "manual",
      forceRerun: true,
    });
    const json = await res.json();
    expect(json.status).toBe("completed");
  });
});
