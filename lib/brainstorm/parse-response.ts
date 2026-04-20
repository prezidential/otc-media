export type ParsedBrainstorm =
  | { kind: "tool"; tool: string; params: Record<string, unknown> }
  | { kind: "assistant"; content: string };

function stripCodeFences(text: string): string {
  return text.replace(/^```(?:json)?\s*|\s*```$/gim, "").trim();
}

/** Parse model output: tool call JSON, final assistant JSON, or plain markdown fallback. */
export function parseBrainstormResponse(raw: string): ParsedBrainstorm | null {
  const stripped = stripCodeFences(raw);
  try {
    const parsed = JSON.parse(stripped) as Record<string, unknown>;
    if (typeof parsed.tool === "string") {
      return {
        kind: "tool",
        tool: parsed.tool,
        params: typeof parsed.params === "object" && parsed.params !== null && !Array.isArray(parsed.params)
          ? (parsed.params as Record<string, unknown>)
          : {},
      };
    }
    const assistant =
      typeof parsed.assistant === "string"
        ? parsed.assistant
        : typeof parsed.assistant_message === "string"
          ? parsed.assistant_message
          : typeof parsed.message === "string"
            ? parsed.message
            : null;
    if (assistant !== null && assistant.trim()) {
      return { kind: "assistant", content: assistant.trim() };
    }
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        const parsed = JSON.parse(match[0]) as Record<string, unknown>;
        if (typeof parsed.tool === "string") {
          return {
            kind: "tool",
            tool: parsed.tool,
            params:
              typeof parsed.params === "object" && parsed.params !== null && !Array.isArray(parsed.params)
                ? (parsed.params as Record<string, unknown>)
                : {},
          };
        }
        const assistant =
          typeof parsed.assistant === "string"
            ? parsed.assistant
            : typeof parsed.assistant_message === "string"
              ? parsed.assistant_message
              : null;
        if (assistant?.trim()) return { kind: "assistant", content: assistant.trim() };
      } catch {
        /* fall through */
      }
    }
  }
  const trimmed = raw.trim();
  if (trimmed) return { kind: "assistant", content: trimmed };
  return null;
}
