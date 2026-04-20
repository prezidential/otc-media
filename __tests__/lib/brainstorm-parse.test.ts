import { describe, it, expect } from "vitest";
import { parseBrainstormResponse } from "@/lib/brainstorm/parse-response";

describe("parseBrainstormResponse", () => {
  it("parses tool call", () => {
    const p = parseBrainstormResponse('{"tool":"query_signals","params":{"q":"oauth"}}');
    expect(p).toEqual({ kind: "tool", tool: "query_signals", params: { q: "oauth" } });
  });

  it("parses assistant wrapper", () => {
    const p = parseBrainstormResponse('{"assistant":"Hello **world**"}');
    expect(p).toEqual({ kind: "assistant", content: "Hello **world**" });
  });

  it("falls back to plain text", () => {
    const p = parseBrainstormResponse("Just a prose reply.");
    expect(p).toEqual({ kind: "assistant", content: "Just a prose reply." });
  });
});
