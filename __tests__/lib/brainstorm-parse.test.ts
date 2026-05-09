import { describe, it, expect } from "vitest";
import { parseBrainstormResponse } from "@/lib/brainstorm/parse-response";

describe("parseBrainstormResponse", () => {
  it("parses tool call", () => {
    const p = parseBrainstormResponse('{"tool":"query_signals","params":{"q":"oauth"}}');
    expect(p).toEqual({ kind: "tool", tool: "query_signals", params: { q: "oauth" } });
  });

  it("parses fenced JSON tool calls and drops invalid params", () => {
    const p = parseBrainstormResponse('```json\n{"tool":"query_signals","params":["bad"]}\n```');
    expect(p).toEqual({ kind: "tool", tool: "query_signals", params: {} });
  });

  it("parses assistant wrapper", () => {
    const p = parseBrainstormResponse('{"assistant":"Hello **world**"}');
    expect(p).toEqual({ kind: "assistant", content: "Hello **world**" });
  });

  it("parses alternate assistant wrapper keys", () => {
    expect(parseBrainstormResponse('{"assistant_message":"  Draft direction  "}')).toEqual({
      kind: "assistant",
      content: "Draft direction",
    });
    expect(parseBrainstormResponse('{"message":"Use the robotics angle."}')).toEqual({
      kind: "assistant",
      content: "Use the robotics angle.",
    });
  });

  it("repairs JSON embedded in prose", () => {
    const p = parseBrainstormResponse('Use this next:\n{"tool":"get_signal","params":{"id":"sig-1"}}\nThanks.');
    expect(p).toEqual({ kind: "tool", tool: "get_signal", params: { id: "sig-1" } });
  });

  it("falls back to plain text", () => {
    const p = parseBrainstormResponse("Just a prose reply.");
    expect(p).toEqual({ kind: "assistant", content: "Just a prose reply." });
  });

  it("returns null for whitespace-only responses", () => {
    expect(parseBrainstormResponse(" \n\t ")).toBeNull();
  });
});
