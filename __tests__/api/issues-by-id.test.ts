import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockSupabase } from "./helpers";

const mockSupabase = createMockSupabase();
const ctx = { supabase: mockSupabase, workspaceId: "ws-123", userId: "user-1", role: "owner" };

const { requireWorkspaceMock } = vi.hoisted(() => ({ requireWorkspaceMock: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ requireWorkspace: requireWorkspaceMock }));

import { GET } from "@/app/api/issues/[id]/route";

function routeCtx(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  requireWorkspaceMock.mockImplementation(async () => ctx);
});

describe("GET /api/issues/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    requireWorkspaceMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401 })
    );
    const res = await GET(new Request("http://localhost/api/issues/draft-1"), routeCtx("draft-1"));
    expect(res.status).toBe(401);
  });

  it("loads a draft by id, workspace-scoped", async () => {
    mockSupabase._setResult("issue_drafts", {
      data: {
        id: "draft-1",
        content: "# Issue",
        content_json: { title: "The access model" },
        created_at: "2026-06-08T00:00:00Z",
        status: "published",
      },
      error: null,
    });

    const res = await GET(new Request("http://localhost/api/issues/draft-1"), routeCtx("draft-1"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.id).toBe("draft-1");
    expect(json.draft).toBe("# Issue");
    expect(json.content_json).toEqual({ title: "The access model" });
    expect(json.status).toBe("published");
  });

  it("returns 404 when the draft is not found", async () => {
    mockSupabase._setResult("issue_drafts", { data: null, error: null });
    const res = await GET(new Request("http://localhost/api/issues/missing"), routeCtx("missing"));
    expect(res.status).toBe(404);
  });
});
