import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockSupabase, makeJsonRequest, makeRequest } from "./helpers";

const mockSupabase = createMockSupabase();
const ctx = { supabase: mockSupabase, workspaceId: "ws-123", userId: "user-1", role: "owner" as const };

vi.mock("@/lib/auth/session", () => ({
  requireWorkspace: vi.fn(async () => ctx),
}));

import { GET as ListGET } from "@/app/api/research-sources/list/route";
import { POST as CreatePOST } from "@/app/api/research-sources/create/route";
import { POST as ApprovePOST } from "@/app/api/research-sources/[id]/approve/route";
import { POST as RejectPOST } from "@/app/api/research-sources/[id]/reject/route";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/research-sources/list", () => {
  it("lists sources for the active workspace", async () => {
    const sources = [
      { id: "s-1", name: "Dark Reading", feed_url: "https://www.darkreading.com/rss.xml", status: "approved" },
    ];
    const chain = mockSupabase._setResult("research_sources", { data: sources, error: null });

    const res = await ListGET(makeRequest("http://localhost:3000/api/research-sources/list"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.sources).toEqual(sources);
    expect(chain.eq).toHaveBeenCalledWith("workspace_id", "ws-123");
  });

  it("filters by status when provided", async () => {
    const chain = mockSupabase._setResult("research_sources", { data: [], error: null });

    await ListGET(makeRequest("http://localhost:3000/api/research-sources/list?status=proposed"));

    expect(chain.eq).toHaveBeenCalledWith("workspace_id", "ws-123");
    expect(chain.eq).toHaveBeenCalledWith("status", "proposed");
  });
});

describe("POST /api/research-sources/create", () => {
  it("returns 400 when name or feed_url is missing", async () => {
    const missingName = await CreatePOST(
      makeJsonRequest("http://localhost:3000/api/research-sources/create", { feed_url: "https://example.com/feed.xml" })
    );
    expect(missingName.status).toBe(400);
    expect((await missingName.json()).error).toBe("name is required");

    const missingFeed = await CreatePOST(
      makeJsonRequest("http://localhost:3000/api/research-sources/create", { name: "Example" })
    );
    expect(missingFeed.status).toBe(400);
    expect((await missingFeed.json()).error).toBe("feed_url is required");
  });

  it("inserts an auto-approved user source", async () => {
    const source = {
      id: "s-1",
      name: "Dark Reading",
      feed_url: "https://www.darkreading.com/rss.xml",
      site_url: null,
      status: "approved",
      proposed_by: "user",
      trust_score: 1.0,
      created_at: "2026-08-31T00:00:00Z",
    };
    const chain = mockSupabase._setResult("research_sources", { data: source, error: null });

    const res = await CreatePOST(
      makeJsonRequest("http://localhost:3000/api/research-sources/create", {
        name: "Dark Reading",
        feed_url: "https://www.darkreading.com/rss.xml",
      })
    );
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.ok).toBe(true);
    expect(json.source).toEqual(source);
    expect(chain.insert).toHaveBeenCalled();
    const payload = chain.insert.mock.calls[0][0];
    expect(payload).toMatchObject({
      workspace_id: "ws-123",
      status: "approved",
      proposed_by: "user",
      trust_score: 1.0,
    });
  });

  it("returns 409 when the feed URL already exists", async () => {
    mockSupabase._setResult("research_sources", {
      data: null,
      error: { code: "23505", message: "duplicate" },
    });

    const res = await CreatePOST(
      makeJsonRequest("http://localhost:3000/api/research-sources/create", {
        name: "Dup",
        feed_url: "https://example.com/feed.xml",
      })
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("This feed URL is already in your sources.");
  });
});

describe("POST /api/research-sources/[id]/approve|reject", () => {
  it("approves a proposed source without changing trust_score in the update payload", async () => {
    const chain = mockSupabase._setResult("research_sources", {
      data: { id: "s-1", name: "Agent Feed", status: "approved" },
      error: null,
    });

    const res = await ApprovePOST(makeRequest("http://localhost:3000/api/research-sources/s-1/approve", { method: "POST" }), {
      params: Promise.resolve({ id: "s-1" }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(chain.update).toHaveBeenCalledWith({ status: "approved" });
    expect(chain.eq).toHaveBeenCalledWith("id", "s-1");
    expect(chain.eq).toHaveBeenCalledWith("workspace_id", "ws-123");
  });

  it("rejects a proposed source", async () => {
    const chain = mockSupabase._setResult("research_sources", {
      data: { id: "s-1", name: "Agent Feed", status: "rejected" },
      error: null,
    });

    const res = await RejectPOST(makeRequest("http://localhost:3000/api/research-sources/s-1/reject", { method: "POST" }), {
      params: Promise.resolve({ id: "s-1" }),
    });

    expect(res.status).toBe(200);
    expect(chain.update).toHaveBeenCalledWith({ status: "rejected" });
  });
});
