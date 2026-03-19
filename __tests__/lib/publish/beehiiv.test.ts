import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { isBeehiivEnabled, createBeehiivDraft } from "@/lib/publish/beehiiv";

const originalFetch = globalThis.fetch;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("BEEHIIV_ENABLED", "false");
  vi.stubEnv("BEEHIIV_API_KEY", "");
  vi.stubEnv("BEEHIIV_PUBLICATION_ID", "");
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("lib/publish/beehiiv", () => {
  it("enables integration only when all required env vars are present", () => {
    vi.stubEnv("BEEHIIV_ENABLED", "true");
    expect(isBeehiivEnabled()).toBe(false);

    vi.stubEnv("BEEHIIV_API_KEY", "api-key");
    vi.stubEnv("BEEHIIV_PUBLICATION_ID", "pub-1");
    expect(isBeehiivEnabled()).toBe(true);
  });

  it("throws when creating a draft while integration is disabled", async () => {
    await expect(
      createBeehiivDraft({
        title: "Issue 1",
        htmlContent: "<p>Hello</p>",
      })
    ).rejects.toThrow("not enabled");
  });

  it("posts draft payload and returns normalized result", async () => {
    vi.stubEnv("BEEHIIV_ENABLED", "true");
    vi.stubEnv("BEEHIIV_API_KEY", "secret-key");
    vi.stubEnv("BEEHIIV_PUBLICATION_ID", "pub-123");

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: {
            id: "post-1",
            title: "Issue 1",
            status: "draft",
            web_url: "https://beehiiv.com/p/post-1",
          },
        }),
    }) as typeof fetch;

    const result = await createBeehiivDraft({
      title: "Issue 1",
      subtitle: "Guardrails",
      htmlContent: "<p>Hello</p>",
    });

    expect(result).toEqual({
      id: "post-1",
      title: "Issue 1",
      status: "draft",
      web_url: "https://beehiiv.com/p/post-1",
    });

    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/publications/pub-123/posts");
    expect(options.method).toBe("POST");
    expect(options.headers).toMatchObject({
      Authorization: "Bearer secret-key",
      "Content-Type": "application/json",
    });

    const body = JSON.parse(options.body as string);
    expect(body).toMatchObject({
      title: "Issue 1",
      subtitle: "Guardrails",
      body_content: "<p>Hello</p>",
      status: "draft",
    });
  });

  it("propagates API error details from Beehiiv", async () => {
    vi.stubEnv("BEEHIIV_ENABLED", "true");
    vi.stubEnv("BEEHIIV_API_KEY", "secret-key");
    vi.stubEnv("BEEHIIV_PUBLICATION_ID", "pub-123");

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      json: () =>
        Promise.resolve({
          errors: [{ message: "Invalid post body" }],
        }),
    }) as typeof fetch;

    await expect(
      createBeehiivDraft({
        title: "Issue 1",
        htmlContent: "<p>Broken</p>",
      })
    ).rejects.toThrow("Beehiiv API error: Invalid post body");
  });
});
