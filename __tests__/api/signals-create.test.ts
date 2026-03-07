import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockSupabase, makeJsonRequest } from "./helpers";

const mockSupabase = createMockSupabase();
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => mockSupabase,
}));

import { POST } from "@/app/api/signals/create/route";

beforeEach(() => {
  vi.stubEnv("WORKSPACE_ID", "ws-123");
  vi.clearAllMocks();
});

describe("POST /api/signals/create", () => {
  it("returns 400 when title is missing", async () => {
    const req = makeJsonRequest("http://localhost:3000/api/signals/create", {});
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("title is required");
  });

  it("creates a manual signal with just a title", async () => {
    const chain = mockSupabase._setResult("signals", {
      data: { title: "Manual topic", publisher: "Manual Entry", url: "manual://abc" },
      error: null,
    });

    const req = makeJsonRequest("http://localhost:3000/api/signals/create", {
      title: "Manual topic",
    });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.signal.title).toBe("Manual topic");
  });

  it("accepts optional url, publisher, and notes", async () => {
    mockSupabase._setResult("signals", {
      data: { title: "Test", publisher: "Custom Pub", url: "https://example.com" },
      error: null,
    });

    const req = makeJsonRequest("http://localhost:3000/api/signals/create", {
      title: "Test",
      url: "https://example.com",
      publisher: "Custom Pub",
      notes: "Some notes",
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });

  it("returns 500 on supabase error", async () => {
    mockSupabase._setResult("signals", {
      data: null,
      error: { message: "duplicate" },
    });

    const req = makeJsonRequest("http://localhost:3000/api/signals/create", {
      title: "Duplicate signal",
    });
    const res = await POST(req);
    expect(res.status).toBe(500);
  });
});
