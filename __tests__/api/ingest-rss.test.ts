import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockSupabase, makeJsonRequest } from "./helpers";

const mockSupabase = createMockSupabase();
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => mockSupabase,
}));

vi.mock("rss-parser", () => {
  class MockParser {
    parseURL = vi.fn().mockResolvedValue({
      title: "Test Feed",
      items: [
        {
          title: "Article 1",
          link: "https://example.com/article1",
          isoDate: "2026-01-01T00:00:00Z",
          contentSnippet: "Snippet 1",
        },
        {
          title: "Article 2",
          link: "https://example.com/article2",
          isoDate: "2026-01-02T00:00:00Z",
          contentSnippet: "Snippet 2",
        },
        {
          title: "",
          link: "",
        },
      ],
    });
  }
  return { default: MockParser };
});

import { POST } from "@/app/api/ingest/rss/route";

beforeEach(() => {
  vi.stubEnv("WORKSPACE_ID", "ws-123");
  vi.clearAllMocks();
});

describe("POST /api/ingest/rss", () => {
  it("returns 400 when feedUrl is missing", async () => {
    const req = makeJsonRequest("http://localhost:3000/api/ingest/rss", {});
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("feedUrl required");
  });

  it("ingests RSS feed and returns counts", async () => {
    const chain = mockSupabase._setResult("sources", { data: { id: "src-1" }, error: null });
    const signalsChain = mockSupabase._setResult("signals", { data: null, error: null });
    // Make insert on signals succeed (no error)
    signalsChain.insert = vi.fn().mockResolvedValue({ error: null });

    const req = makeJsonRequest("http://localhost:3000/api/ingest/rss", {
      feedUrl: "https://example.com/feed.xml",
      limit: 10,
    });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.feedUrl).toBe("https://example.com/feed.xml");
    expect(json.publisher).toBe("Test Feed");
    expect(typeof json.inserted).toBe("number");
    expect(typeof json.skipped).toBe("number");
  });
});
