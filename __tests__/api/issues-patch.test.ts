import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockSupabase, makeJsonRequest } from "./helpers";

const mockSupabase = createMockSupabase();
const ctx = { supabase: mockSupabase, workspaceId: "ws-123", userId: "user-1", role: "owner" as const };

const { requireWorkspaceMock } = vi.hoisted(() => ({ requireWorkspaceMock: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ requireWorkspace: requireWorkspaceMock }));

import { PATCH } from "@/app/api/issues/[id]/route";

function routeCtx(id: string) {
  return { params: Promise.resolve({ id }) };
}

function patchReq(id: string, body: unknown) {
  return [
    new Request(`http://localhost/api/issues/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    routeCtx(id),
  ] as const;
}

const existingJson = {
  title: "Old title",
  hook_paragraphs: ["Old hook."],
  fresh_signals: "",
  deep_dive: "Old deep dive.",
  last_word: "Old last word.",
  promo_slot: "",
  close: "Old close.",
  sources: [],
  metadata: { model: "claude-test", thesis: "Existing thesis." },
};

beforeEach(() => {
  vi.clearAllMocks();
  requireWorkspaceMock.mockImplementation(async () => ctx);
});

describe("PATCH /api/issues/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    requireWorkspaceMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401 })
    );
    const res = await PATCH(...patchReq("draft-1", { content_json: { title: "x" } }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when no editable fields are provided", async () => {
    const res = await PATCH(...patchReq("draft-1", { content_json: { bogus: 1 } }));
    expect(res.status).toBe(400);
  });

  it("returns 404 when the draft is not found", async () => {
    mockSupabase._setResult("issue_drafts", { data: null, error: null });
    const res = await PATCH(...patchReq("missing", { content_json: { title: "New" } }));
    expect(res.status).toBe(404);
  });

  it("merges the patch onto existing content_json and persists", async () => {
    const chain = mockSupabase._setResult("issue_drafts", {
      data: { id: "draft-1", content_json: existingJson },
      error: null,
    });

    const res = await PATCH(
      ...patchReq("draft-1", {
        content_json: {
          title: "New title",
          fresh_signals: "**Fresh Signals**\n\nThis week.",
        },
      })
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.content_json.title).toBe("New title");
    // unchanged field preserved from existing shape
    expect(json.content_json.deep_dive).toBe("Old deep dive.");
    expect(json.content_json.fresh_signals).toContain("This week.");
    // rendered markdown reflects the new title
    expect(json.draft).toContain("New title");

    // update was called workspace-scoped with merged json
    expect(chain.update).toHaveBeenCalledTimes(1);
    const updateArg = chain.update.mock.calls[0][0];
    expect(updateArg.content_json.title).toBe("New title");
    expect(typeof updateArg.content).toBe("string");
  });

  it("ignores unknown keys and only patches whitelisted fields", async () => {
    mockSupabase._setResult("issue_drafts", {
      data: { id: "draft-1", content_json: existingJson },
      error: null,
    });
    const res = await PATCH(
      ...patchReq("draft-1", {
        content_json: { close: "New close.", hacker: "drop table" },
      })
    );
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.content_json.close).toBe("New close.");
    expect(json.content_json).not.toHaveProperty("hacker");
  });

  it("coerces hook_paragraphs/sources arrays to string-only", async () => {
    mockSupabase._setResult("issue_drafts", {
      data: { id: "draft-1", content_json: existingJson },
      error: null,
    });
    const res = await PATCH(
      ...patchReq("draft-1", {
        content_json: { hook_paragraphs: ["a", 2, "b"], sources: ["https://x.test", null] },
      })
    );
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.content_json.hook_paragraphs).toEqual(["a", "b"]);
    expect(json.content_json.sources).toEqual(["https://x.test"]);
  });
});
