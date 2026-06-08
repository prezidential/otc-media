// Dependency-free lightweight Markdown parser for chat rendering.
// Handles the subset the Brainstormer actually emits: paragraphs, headings,
// ordered/unordered lists, fenced code blocks, and inline bold/italic/code/links.
// Pure functions so they can be unit-tested in a node environment; the React
// renderer (app/components/markdown.tsx) builds elements from these tokens
// (no dangerouslySetInnerHTML, so no XSS surface).

export type InlineToken =
  | { type: "text"; value: string }
  | { type: "bold"; value: string }
  | { type: "italic"; value: string }
  | { type: "code"; value: string }
  | { type: "link"; value: string; href: string };

export type Block =
  | { type: "p"; lines: string[] }
  | { type: "heading"; level: number; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "code"; text: string };

const INLINE_RE =
  /(`[^`]+`)|(\*\*[^*]+\*\*)|(\[[^\]]+\]\([^)\s]+\))|(\*[^*\n]+\*|_[^_\n]+_)/;

/** Parse a single line of text into inline tokens (bold, italic, code, links). */
export function parseInline(text: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let rest = text;
  while (rest.length > 0) {
    const m = INLINE_RE.exec(rest);
    if (!m || m.index === undefined) {
      tokens.push({ type: "text", value: rest });
      break;
    }
    if (m.index > 0) tokens.push({ type: "text", value: rest.slice(0, m.index) });
    const tok = m[0];
    if (tok.startsWith("`")) {
      tokens.push({ type: "code", value: tok.slice(1, -1) });
    } else if (tok.startsWith("**")) {
      tokens.push({ type: "bold", value: tok.slice(2, -2) });
    } else if (tok.startsWith("[")) {
      const linkMatch = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(tok);
      if (linkMatch) {
        tokens.push({ type: "link", value: linkMatch[1]!, href: linkMatch[2]! });
      } else {
        tokens.push({ type: "text", value: tok });
      }
    } else {
      tokens.push({ type: "italic", value: tok.slice(1, -1) });
    }
    rest = rest.slice(m.index + tok.length);
  }
  return tokens;
}

/** Parse a markdown string into a flat list of block tokens. */
export function parseBlocks(md: string): Block[] {
  const lines = (md ?? "").replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let para: string[] = [];

  const flushPara = () => {
    if (para.length > 0) {
      blocks.push({ type: "p", lines: para });
      para = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    // Fenced code block
    if (/^```/.test(line.trim())) {
      flushPara();
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i]!.trim())) {
        body.push(lines[i]!);
        i++;
      }
      blocks.push({ type: "code", text: body.join("\n") });
      continue;
    }

    if (line.trim() === "") {
      flushPara();
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      flushPara();
      blocks.push({ type: "heading", level: heading[1]!.length, text: heading[2]! });
      continue;
    }

    const ul = /^\s*[-*]\s+(.*)$/.exec(line);
    if (ul) {
      flushPara();
      const items: string[] = [ul[1]!];
      while (i + 1 < lines.length) {
        const next = /^\s*[-*]\s+(.*)$/.exec(lines[i + 1]!);
        if (!next) break;
        items.push(next[1]!);
        i++;
      }
      blocks.push({ type: "ul", items });
      continue;
    }

    const ol = /^\s*\d+\.\s+(.*)$/.exec(line);
    if (ol) {
      flushPara();
      const items: string[] = [ol[1]!];
      while (i + 1 < lines.length) {
        const next = /^\s*\d+\.\s+(.*)$/.exec(lines[i + 1]!);
        if (!next) break;
        items.push(next[1]!);
        i++;
      }
      blocks.push({ type: "ol", items });
      continue;
    }

    para.push(line);
  }
  flushPara();
  return blocks;
}
