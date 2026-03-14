import type { DraftContentJson } from "@/lib/draft/content";

export function renderDraftHtml(draft: DraftContentJson): string {
  const sections: string[] = [];

  if (draft.title) {
    sections.push(`<h1 style="font-size:28px;font-weight:700;margin:0 0 24px 0;line-height:1.2;">${esc(draft.title)}</h1>`);
  }

  if (draft.hook_paragraphs.length) {
    const hookHtml = draft.hook_paragraphs
      .map((p) => `<p style="font-size:16px;line-height:1.6;margin:0 0 12px 0;">${esc(p)}</p>`)
      .join("\n");
    sections.push(hookHtml);
  }

  if (draft.fresh_signals) {
    sections.push(renderSignalsHtml(draft.fresh_signals));
  }

  if (draft.deep_dive) {
    sections.push(
      `<h2 style="font-size:22px;font-weight:700;margin:32px 0 16px 0;">Deep Dive</h2>\n` +
      renderProseHtml(draft.deep_dive)
    );
  }

  if (draft.dojo_checklist.length) {
    const items = draft.dojo_checklist
      .map((b) => `<li style="margin:0 0 8px 0;font-size:15px;line-height:1.5;">${esc(b)}</li>`)
      .join("\n");
    sections.push(
      `<h2 style="font-size:22px;font-weight:700;margin:32px 0 16px 0;">From the Dojo</h2>\n<ul style="padding-left:20px;margin:0;">\n${items}\n</ul>`
    );
  }

  if (draft.promo_slot) {
    sections.push(
      `<div style="background:#f0fdf4;border-left:4px solid #10b981;padding:16px 20px;margin:32px 0;border-radius:4px;">\n` +
      renderProseHtml(draft.promo_slot) +
      `\n</div>`
    );
  }

  if (draft.close) {
    sections.push(
      `<div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;">\n` +
      renderProseHtml(draft.close) +
      `\n</div>`
    );
  }

  return sections.join("\n\n");
}

function esc(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderProseHtml(text: string): string {
  return text
    .split(/\n\n+/)
    .map((para) => {
      let html = esc(para.trim());
      html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
      return `<p style="font-size:15px;line-height:1.6;margin:0 0 12px 0;">${html}</p>`;
    })
    .join("\n");
}

function renderSignalsHtml(text: string): string {
  const lines = text.split("\n");
  const htmlParts: string[] = [];
  let inSources = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) { inSources = false; continue; }

    if (trimmed.startsWith("**") && trimmed.endsWith("**")) {
      const title = trimmed.slice(2, -2);
      if (title.toLowerCase() === "fresh signals") {
        htmlParts.push(`<h2 style="font-size:22px;font-weight:700;margin:32px 0 16px 0;">Fresh Signals</h2>`);
      } else {
        htmlParts.push(`<h3 style="font-size:17px;font-weight:600;margin:20px 0 8px 0;">${esc(title)}</h3>`);
      }
      inSources = false;
    } else if (trimmed === "Sources:" || trimmed === "Sources") {
      inSources = true;
    } else if (inSources && trimmed.startsWith("- http")) {
      const url = trimmed.replace(/^-\s*/, "");
      htmlParts.push(`<p style="font-size:12px;margin:2px 0;"><a href="${esc(url)}" style="color:#6b7280;text-decoration:underline;">${esc(url)}</a></p>`);
    } else {
      htmlParts.push(`<p style="font-size:15px;line-height:1.6;margin:0 0 8px 0;">${esc(trimmed)}</p>`);
      inSources = false;
    }
  }

  return htmlParts.join("\n");
}
