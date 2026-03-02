import { claudeClient } from "@/lib/llm/claude";

const LINT_MODEL = "claude-sonnet-4-20250514";

export const FORBIDDEN_LINT_PATTERNS = [
  "the real issue is",
  "the real risk is",
  "the real problem is",
];

export const DASH_REPLACE_MAP: [string, string][] = [
  ["nation-state", "nation state"],
  ["machine-speed", "machine speed"],
  ["real-time", "real time"],
  ["proof-of-concept", "proof of concept"],
  ["pre-authorized", "pre authorized"],
];

export function applyDashReplaceMap(text: string): string {
  let out = text;
  for (const [from, to] of DASH_REPLACE_MAP) {
    out = out.split(from).join(to);
  }
  return out;
}

export type LintViolation = { type: string; snippet: string; lineNumber: number };

const EM_DASH = "\u2014";
const EN_DASH = "\u2013";
const SPACE_DASH_SPACE = /\s-\s/;

function isLintExcludedLine(line: string): boolean {
  const t = line.trim();
  if (t.startsWith("Sources:")) return true;
  if (/^-\s*https?:\/\//i.test(t)) return true;
  if (t === "---") return true;
  return false;
}

export function lintDraft(text: string): LintViolation[] {
  const violations: LintViolation[] = [];
  if (!text.trim()) return violations;
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1;
    if (isLintExcludedLine(line)) continue;
    const lower = line.toLowerCase();
    for (const p of FORBIDDEN_LINT_PATTERNS) {
      if (lower.includes(p)) {
        violations.push({ type: "forbidden_phrase", snippet: p, lineNumber });
        break;
      }
    }
    if (line.includes(EM_DASH)) {
      violations.push({ type: "em_dash", snippet: line.trim().slice(0, 80), lineNumber });
    }
    if (line.includes(EN_DASH)) {
      violations.push({ type: "en_dash", snippet: line.trim().slice(0, 80), lineNumber });
    }
    if (SPACE_DASH_SPACE.test(line)) {
      violations.push({ type: "space_dash_space", snippet: line.trim().slice(0, 80), lineNumber });
    }
  }
  return violations;
}

function safeJsonParse<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export async function rewriteLintViolations(
  text: string,
  violations: LintViolation[]
): Promise<string> {
  const lineNumbers = [...new Set(violations.map((v) => v.lineNumber))].sort((a, b) => a - b);
  const lines = text.split("\n");
  const offendingLines = lineNumbers.map((n) => lines[n - 1] ?? "");
  const client = claudeClient();
  const prompt = `Rewrite only these sentences to comply: no forbidden phrases ("the real issue is", "the real risk is", "the real problem is"); no em dash (—) or en dash (–); no space-dash-space in prose. Do not change structure or add facts. Return a JSON array of the corrected sentences in the same order, one per line. Example: ["First corrected sentence.", "Second corrected sentence."]

Sentences to fix (one per line, in order):
${offendingLines.map((l, i) => `${i + 1}. ${l}`).join("\n")}`;
  const msg = await client.messages.create({
    model: LINT_MODEL,
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  });
  const block = msg.content?.find((b) => b.type === "text");
  const raw = block && block.type === "text" ? (block as { type: "text"; text: string }).text.trim() : "";
  const stripped = raw.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  const parsed = safeJsonParse<string[]>(stripped);
  if (!parsed || !Array.isArray(parsed) || parsed.length !== lineNumbers.length) {
    return text;
  }
  const result = [...lines];
  for (let i = 0; i < lineNumbers.length; i++) {
    const idx = lineNumbers[i] - 1;
    if (idx >= 0 && idx < result.length) result[idx] = parsed[i] ?? result[idx];
  }
  return result.join("\n");
}
