import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockSupabase } from "./helpers";

const mockSupabase = createMockSupabase();
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => mockSupabase,
}));

import { GET } from "@/app/api/signals/[id]/route";

beforeEach(() => {
  vi.stubEnv("WORKSPACE_ID", "ws-123");
  vi.clearAllMocks();
});

describe("GET /api/signals/[id]", () => {
  it("returns 500 when WORKSPACE_ID is missing", async () => {
    vi.stubEnv("WORKSPACE_ID", "");

    const res = await GET(new Request("http://localhost:3000/api/signals/sig-1"), {
      params: Promise.resolve({ id: "sig-1" }),
    });
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toContain("WORKSPACE_ID");
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  it("returns 400 when id is missing", async () => {
    const res = await GET(new Request("http://localhost:3000/api/signals/"), {
      params: Promise.resolve({ id: "" }),
    });
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("Missing id");
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  it("returns a workspace-scoped signal by id", async () => {
    const signal = {
      id: "sig-1",
      title: "Identity breach",
      url: "https://example.com/breach",
      publisher: "Example",
      published_at: "2026-01-01T00:00:00.000Z",
      captured_at: "2026-01-02T00:00:00.000Z",
      normalized_summary: "A risky identity signal.",
      directive_id: "dir-1",
    };
    const chain = mockSupabase._setResult("signals", { data: signal, error: null });

    const res = await GET(new Request("http://localhost:3000/api/signals/sig-1"), {
      params: Promise.resolve({ id: "sig-1" }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.signal).toEqual(signal);
    expect(chain.select).toHaveBeenCalledWith(
      "id,title,url,publisher,published_at,captured_at,normalized_summary,directive_id"
    );
    expect(chain.eq).toHaveBeenCalledWith("workspace_id", "ws-123");
    expect(chain.eq).toHaveBeenCalledWith("id", "sig-1");
    expect(chain.maybeSingle).toHaveBeenCalled();
  });

  it("returns 404 when the signal is outside the workspace or absent", async () => {
    mockSupabase._setResult("signals", { data: null, error: null });

    const res = await GET(new Request("http://localhost:3000/api/signals/sig-missing"), {
      params: Promise.resolve({ id: "sig-missing" }),
    });
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error).toBe("Not found");
  });

  it("returns 500 on Supabase errors", async () => {
    mockSupabase._setResult("signals", { data: null, error: { message: "database unavailable" } });

    const res = await GET(new Request("http://localhost:3000/api/signals/sig-1"), {
      params: Promise.resolve({ id: "sig-1" }),
    });
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toBe("database unavailable");
  });
});
