import { Fragment } from "react";
import { parseBlocks, parseInline, type InlineToken } from "@/lib/markdown/lite";

function Inline({ tokens }: { tokens: InlineToken[] }) {
  return (
    <>
      {tokens.map((t, i) => {
        switch (t.type) {
          case "bold":
            return (
              <strong key={i} className="font-semibold text-[#1F1A14]">
                {t.value}
              </strong>
            );
          case "italic":
            return (
              <em key={i} className="italic">
                {t.value}
              </em>
            );
          case "code":
            return (
              <code
                key={i}
                className="rounded bg-[#EBDFC5] px-1 py-0.5 font-[family-name:var(--font-geist-mono)] text-[12px] text-[#5A3B1E]"
              >
                {t.value}
              </code>
            );
          case "link":
            return (
              <a
                key={i}
                href={t.href}
                target="_blank"
                rel="noreferrer"
                className="text-[#C8571E] underline underline-offset-2 hover:opacity-80"
              >
                {t.value}
              </a>
            );
          default:
            return <Fragment key={i}>{t.value}</Fragment>;
        }
      })}
    </>
  );
}

/**
 * Renders chat markdown (the subset the Brainstormer emits) into styled React
 * elements. Builds elements from a parsed token tree — no dangerouslySetInnerHTML.
 */
export function Markdown({ text, className }: { text: string; className?: string }) {
  const blocks = parseBlocks(text);
  return (
    <div className={className}>
      {blocks.map((b, i) => {
        switch (b.type) {
          case "heading": {
            const size =
              b.level <= 1 ? "text-[17px]" : b.level === 2 ? "text-[15px]" : "text-[14px]";
            return (
              <p key={i} className={`mb-2 mt-3 font-semibold first:mt-0 ${size}`}>
                <Inline tokens={parseInline(b.text)} />
              </p>
            );
          }
          case "ul":
            return (
              <ul key={i} className="mb-3 ml-1 list-disc space-y-1 pl-4 last:mb-0">
                {b.items.map((it, j) => (
                  <li key={j}>
                    <Inline tokens={parseInline(it)} />
                  </li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol key={i} className="mb-3 ml-1 list-decimal space-y-1 pl-4 last:mb-0">
                {b.items.map((it, j) => (
                  <li key={j}>
                    <Inline tokens={parseInline(it)} />
                  </li>
                ))}
              </ol>
            );
          case "code":
            return (
              <pre
                key={i}
                className="mb-3 overflow-x-auto rounded-lg border border-[#E4D9C2] bg-[#FBF7EE] p-3 font-[family-name:var(--font-geist-mono)] text-[12px] leading-relaxed text-[#1F1A14] last:mb-0"
              >
                <code>{b.text}</code>
              </pre>
            );
          default:
            return (
              <p key={i} className="mb-3 leading-relaxed last:mb-0">
                {b.lines.map((ln, j) => (
                  <Fragment key={j}>
                    {j > 0 && <br />}
                    <Inline tokens={parseInline(ln)} />
                  </Fragment>
                ))}
              </p>
            );
        }
      })}
    </div>
  );
}
