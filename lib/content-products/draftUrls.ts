/**
 * Collect citation URLs from newsletter draft JSON for signal grounding.
 */

const URL_IN_TEXT_RE = /https?:\/\/[^\s)\]>"']+/gi;

export function normalizeUrlForMatch(url: string): string {
  try {
    const u = new URL(url.trim());
    u.hash = "";
    let path = u.pathname.replace(/\/+$/, "") || "";
    return `${u.origin}${path}${u.search}`.toLowerCase();
  } catch {
    return url.trim().toLowerCase().replace(/\/+$/, "");
  }
}

export function collectUrlsFromDraft(contentJson: Record<string, unknown>): string[] {
  const raw = new Set<string>();
  if (Array.isArray(contentJson.sources)) {
    for (const u of contentJson.sources) {
      if (typeof u === "string" && /^https?:\/\//i.test(u)) raw.add(u.trim());
    }
  }
  const fresh = typeof contentJson.fresh_signals === "string" ? contentJson.fresh_signals : "";
  let m: RegExpExecArray | null;
  const re = new RegExp(URL_IN_TEXT_RE.source, "gi");
  while ((m = re.exec(fresh)) !== null) {
    raw.add(m[0].trim());
  }
  return [...raw];
}
