import { describe, expect, it, vi } from "vitest";
import { resolveInsiderOutline, resolveNewsletterOutline } from "@/lib/content-outlines/fetch-outline";
import { DEFAULT_INSIDER_OUTLINE, DEFAULT_NEWSLETTER_OUTLINE } from "@/lib/content-outlines/default-specs";

type QueryResult = { data: unknown; error: { message: string } | null };

function makeSupabaseMock(options?: {
  byIdResult?: QueryResult;
  defaultResult?: QueryResult;
  throwOnFrom?: boolean;
}) {
  const byIdResult = options?.byIdResult ?? { data: null, error: null };
  const defaultResult = options?.defaultResult ?? { data: [], error: null };

  const chain: {
    select: ReturnType<typeof vi.fn>;
    eq: ReturnType<typeof vi.fn>;
    limit: ReturnType<typeof vi.fn>;
    maybeSingle: ReturnType<typeof vi.fn>;
    then: (resolve: (v: QueryResult) => void, reject?: (reason: unknown) => void) => void;
  } = {
    select: vi.fn(),
    eq: vi.fn(),
    limit: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue(byIdResult),
    then: (resolve, reject) => Promise.resolve(defaultResult).then(resolve, reject),
  };

  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.limit.mockReturnValue(chain);

  return {
    from: vi.fn(() => {
      if (options?.throwOnFrom) {
        throw new Error("from failed");
      }
      return chain;
    }),
    chain,
  };
}

describe("resolveNewsletterOutline", () => {
  it("returns parsed outline from explicit contentOutlineId when kind matches", async () => {
    const supabase = makeSupabaseMock({
      byIdResult: {
        data: {
          id: "outline-1",
          kind: "newsletter_issue",
          spec_json: {
            version: 1,
            userPromptTemplate: "Custom {{PRIMARY_THESIS}}",
          },
        },
        error: null,
      },
    });

    const out = await resolveNewsletterOutline(supabase as any, "ws-1", "outline-1");

    expect(out.id).toBe("outline-1");
    expect(out.spec.userPromptTemplate).toBe("Custom {{PRIMARY_THESIS}}");
    expect(out.spec.systemPromptSuffix).toBe(DEFAULT_NEWSLETTER_OUTLINE.systemPromptSuffix);
    expect(supabase.chain.maybeSingle).toHaveBeenCalledTimes(1);
  });

  it("falls back when explicit row kind is not newsletter_issue", async () => {
    const supabase = makeSupabaseMock({
      byIdResult: {
        data: {
          id: "outline-2",
          kind: "insider_access",
          spec_json: { version: 1 },
        },
        error: null,
      },
    });

    const out = await resolveNewsletterOutline(supabase as any, "ws-1", "outline-2");

    expect(out).toEqual({ id: null, spec: DEFAULT_NEWSLETTER_OUTLINE });
  });

  it("falls back when default query returns non-array data", async () => {
    const supabase = makeSupabaseMock({
      defaultResult: {
        data: { id: "not-an-array" },
        error: null,
      },
    });

    const out = await resolveNewsletterOutline(supabase as any, "ws-1");

    expect(out).toEqual({ id: null, spec: DEFAULT_NEWSLETTER_OUTLINE });
    expect(supabase.chain.maybeSingle).not.toHaveBeenCalled();
  });

  it("falls back when query chain throws", async () => {
    const supabase = makeSupabaseMock({ throwOnFrom: true });

    const out = await resolveNewsletterOutline(supabase as any, "ws-1");

    expect(out).toEqual({ id: null, spec: DEFAULT_NEWSLETTER_OUTLINE });
  });
});

describe("resolveInsiderOutline", () => {
  it("returns parsed default insider outline when default row exists", async () => {
    const supabase = makeSupabaseMock({
      defaultResult: {
        data: [
          {
            id: "insider-default-1",
            kind: "insider_access",
            spec_json: {
              version: 1,
              userPromptTemplate: "Insider user prompt",
              systemPromptTemplate: "Insider system prompt",
            },
          },
        ],
        error: null,
      },
    });

    const out = await resolveInsiderOutline(supabase as any, "ws-1");

    expect(out.id).toBe("insider-default-1");
    expect(out.spec.userPromptTemplate).toBe("Insider user prompt");
    expect(out.spec.systemPromptTemplate).toBe("Insider system prompt");
    expect(supabase.chain.maybeSingle).not.toHaveBeenCalled();
  });

  it("falls back when explicit insider query returns error", async () => {
    const supabase = makeSupabaseMock({
      byIdResult: {
        data: null,
        error: { message: "db error" },
      },
    });

    const out = await resolveInsiderOutline(supabase as any, "ws-1", "insider-id");

    expect(out).toEqual({ id: null, spec: DEFAULT_INSIDER_OUTLINE });
  });
});
