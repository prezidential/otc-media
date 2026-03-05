import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeJsonRequest } from "./helpers";

let fetchCallCount = 0;
const originalFetch = globalThis.fetch;

beforeEach(() => {
  fetchCallCount = 0;
  vi.clearAllMocks();
});

describe("POST /api/research/run-all", () => {
  it("calls run-directives for both daily and weekly", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true, inserted: 5, skipped: 1 }),
    });

    const { POST } = await import("@/app/api/research/run-all/route");
    const req = makeJsonRequest("http://localhost:3000/api/research/run-all", {
      limitPerFeed: 10,
    });
    const res = await POST(req);
    const json = await res.json();

    expect(json.ok).toBe(true);
    expect(json.inserted).toBe(10);
    expect(json.skipped).toBe(2);
    expect(json.results.daily).toBeDefined();
    expect(json.results.weekly).toBeDefined();

    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const calls = fetchMock.mock.calls;
    const urls = calls.map((c: unknown[]) => c[0] as string);
    expect(urls.some((u) => u.includes("run-directives"))).toBe(true);

    globalThis.fetch = originalFetch;
  });

  it("reports partial failure when one cadence fails", async () => {
    let callIndex = 0;
    globalThis.fetch = vi.fn().mockImplementation(() => {
      callIndex++;
      if (callIndex === 1) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ ok: true, inserted: 3, skipped: 0 }),
        });
      }
      return Promise.resolve({
        ok: false,
        json: () => Promise.resolve({ ok: false, inserted: 0, skipped: 0, error: "Feed timeout" }),
      });
    });

    const { POST } = await import("@/app/api/research/run-all/route");
    const req = makeJsonRequest("http://localhost:3000/api/research/run-all", {});
    const res = await POST(req);
    const json = await res.json();

    expect(json.ok).toBe(false);
    expect(json.inserted).toBe(3);

    globalThis.fetch = originalFetch;
  });
});
