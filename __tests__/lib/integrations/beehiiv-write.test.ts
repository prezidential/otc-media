import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { resolveBeehiivMcpMock, withMcpMock, isEnabledMock } = vi.hoisted(() => ({
  resolveBeehiivMcpMock: vi.fn(),
  withMcpMock: vi.fn(),
  isEnabledMock: vi.fn(),
}));

vi.mock("@/lib/integrations/beehiiv/index", () => ({
  resolveBeehiivMcp: resolveBeehiivMcpMock,
}));
vi.mock("@/lib/integrations/mcp", () => ({
  withMcp: withMcpMock,
}));
vi.mock("@/lib/publish/beehiiv", () => ({
  isBeehiivEnabled: isEnabledMock,
}));

import { publishBeehiivPost } from "@/lib/integrations/beehiiv/write";

const originalFetch = globalThis.fetch;

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  isEnabledMock.mockReturnValue(true);
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("publishBeehiivPost — disabled", () => {
  it("throws when Beehiiv is not enabled", async () => {
    isEnabledMock.mockReturnValue(false);
    await expect(
      publishBeehiivPost({ title: "T", htmlContent: "<p>x</p>" })
    ).rejects.toThrow("not enabled");
  });
});

describe("publishBeehiivPost — MCP path", () => {
  function mcpCall(handlers: Record<string, (args: Record<string, unknown>) => unknown>) {
    const call = vi.fn(async (name: string, args: Record<string, unknown>) =>
      handlers[name] ? handlers[name](args) : {}
    );
    resolveBeehiivMcpMock.mockResolvedValue({
      config: { url: "x", headers: {}, transport: "auto" },
      pubId: "pub_x",
    });
    withMcpMock.mockImplementation((_cfg: unknown, fn: (c: typeof call) => unknown) => fn(call));
    return call;
  }

  it("creates a new draft via save_post when no existing id and no title match", async () => {
    const call = mcpCall({
      list_posts: () => ({ posts: [] }),
      save_post: () => ({ id: "post_new", title: "Issue 9", status: "draft", web_url: "https://b/p9" }),
    });

    const res = await publishBeehiivPost(
      { title: "Issue 9", htmlContent: "<p>body</p>", subtitle: "sub", previewText: "peek" },
      { ctx: { workspaceId: "w", userId: "u", supabase: {} as never } }
    );

    expect(res).toMatchObject({ id: "post_new", action: "create", transport: "mcp" });
    expect(call).toHaveBeenCalledWith(
      "save_post",
      expect.objectContaining({
        publication_id: "pub_x",
        title: "Issue 9",
        html_content: "<p>body</p>",
        subtitle: "sub",
        email_settings: { preview_text: "peek" },
      })
    );
  });

  it("updates the stored post via edit_post_content + edit_post (no create)", async () => {
    const call = mcpCall({
      edit_post_content: () => ({}),
      edit_post: () => ({ id: "post_1", title: "Issue 9", status: "draft", web_url: "https://b/p1" }),
    });

    const res = await publishBeehiivPost(
      { title: "Issue 9", htmlContent: "<p>v2</p>", seo: { default_title: "X" } },
      { existingPostId: "post_1", ctx: { workspaceId: "w", userId: "u", supabase: {} as never } }
    );

    expect(res).toMatchObject({ id: "post_1", action: "update", transport: "mcp" });
    // doc-level replace of the whole body
    expect(call).toHaveBeenCalledWith(
      "edit_post_content",
      expect.objectContaining({
        post_id: "post_1",
        operations: [{ type: "replace", target: "doc", content: "<p>v2</p>" }],
      })
    );
    expect(call).toHaveBeenCalledWith(
      "edit_post",
      expect.objectContaining({ post_id: "post_1", title: "Issue 9", seo_settings: { default_title: "X" } })
    );
    // never creates
    expect(call).not.toHaveBeenCalledWith("save_post", expect.anything());
  });

  it("reconciles by title via list_posts when no stored id, then updates", async () => {
    const call = mcpCall({
      list_posts: () => ({ posts: [{ id: "post_match", title: "Issue 9" }] }),
      edit_post_content: () => ({}),
      edit_post: () => ({ id: "post_match", title: "Issue 9", status: "draft", web_url: "" }),
    });

    const res = await publishBeehiivPost(
      { title: "issue 9", htmlContent: "<p>x</p>" },
      { ctx: { workspaceId: "w", userId: "u", supabase: {} as never } }
    );

    expect(res).toMatchObject({ id: "post_match", action: "update" });
    expect(call).not.toHaveBeenCalledWith("save_post", expect.anything());
  });
});

describe("publishBeehiivPost — REST fallback", () => {
  it("POSTs to create when no MCP token and no existing id", async () => {
    resolveBeehiivMcpMock.mockResolvedValue(null);
    vi.stubEnv("BEEHIIV_API_KEY", "key");
    vi.stubEnv("BEEHIIV_PUBLICATION_ID", "pub_x");
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: { id: "post_rest", title: "T", status: "draft", web_url: "https://b/r" } }),
    }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const res = await publishBeehiivPost({ title: "T", htmlContent: "<p>x</p>" });

    expect(res).toMatchObject({ id: "post_rest", action: "create", transport: "rest" });
    const [url, options] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/publications/pub_x/posts");
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body as string)).toMatchObject({ status: "draft", body_content: "<p>x</p>" });
  });

  it("PUTs to update when no MCP token but an existing id is present", async () => {
    resolveBeehiivMcpMock.mockResolvedValue(null);
    vi.stubEnv("BEEHIIV_API_KEY", "key");
    vi.stubEnv("BEEHIIV_PUBLICATION_ID", "pub_x");
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: { id: "post_1", title: "T", status: "draft", web_url: "" } }),
    }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const res = await publishBeehiivPost(
      { title: "T", htmlContent: "<p>x</p>" },
      { existingPostId: "post_1" }
    );

    expect(res).toMatchObject({ id: "post_1", action: "update", transport: "rest" });
    const [url, options] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/publications/pub_x/posts/post_1");
    expect(options.method).toBe("PUT");
  });
});
