import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockSupabase, makeJsonRequest } from "./helpers";

const mockSupabase = createMockSupabase();
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => mockSupabase,
}));

import { POST } from "@/app/api/leads/approve/route";

beforeEach(() => {
  vi.stubEnv("WORKSPACE_ID", "ws-123");
  vi.clearAllMocks();
});

describe("POST /api/leads/approve", () => {
  it("returns 400 when no leadId provided", async () => {
    const req = makeJsonRequest("http://localhost:3000/api/leads/approve", {});
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("required");
  });

  it("approves a lead with leadId", async () => {
    const chain = mockSupabase._setResult("editorial_leads", {
      data: { id: "lead-1", status: "approved" },
      error: null,
    });

    const req = makeJsonRequest("http://localhost:3000/api/leads/approve", {
      leadId: "lead-1",
    });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.lead.status).toBe("approved");
    expect(chain.update).toHaveBeenCalledWith({ status: "approved" });
  });

  it("accepts id as alternative to leadId", async () => {
    mockSupabase._setResult("editorial_leads", {
      data: { id: "lead-2", status: "approved" },
      error: null,
    });

    const req = makeJsonRequest("http://localhost:3000/api/leads/approve", {
      id: "lead-2",
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });

  it("returns 500 on supabase error", async () => {
    mockSupabase._setResult("editorial_leads", {
      data: null,
      error: { message: "Update failed" },
    });

    const req = makeJsonRequest("http://localhost:3000/api/leads/approve", {
      leadId: "lead-1",
    });
    const res = await POST(req);
    expect(res.status).toBe(500);
  });
});
