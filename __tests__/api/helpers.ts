import { vi } from "vitest";

export type MockSupabaseChain = {
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  gte: ReturnType<typeof vi.fn>;
  in: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
};

export function createMockSupabaseChain(
  finalResult: { data: unknown; error: unknown } = { data: null, error: null }
): MockSupabaseChain {
  const chain: MockSupabaseChain = {} as MockSupabaseChain;
  const methods = ["select", "insert", "update", "eq", "gte", "in", "order", "limit"] as const;
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain.maybeSingle = vi.fn().mockResolvedValue(finalResult);
  chain.single = vi.fn().mockResolvedValue(finalResult);

  // Make the chain itself thenable for queries that don't call single/maybeSingle
  (chain as unknown as { then: (resolve: (v: unknown) => void) => void }).then = (resolve) =>
    resolve(finalResult);

  return chain;
}

export function createMockSupabase() {
  const chains = new Map<string, MockSupabaseChain>();

  const from = vi.fn((table: string) => {
    if (!chains.has(table)) {
      chains.set(table, createMockSupabaseChain());
    }
    return chains.get(table)!;
  });

  return {
    from,
    _chains: chains,
    _setResult(table: string, result: { data: unknown; error: unknown }) {
      const chain = createMockSupabaseChain(result);
      chains.set(table, chain);
      return chain;
    },
  };
}

export function createMockClaudeClient() {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: "text", text: "{}" }],
      }),
    },
  };
}

export function makeRequest(url: string, init?: RequestInit): Request {
  return new Request(url, init);
}

export function makeJsonRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
