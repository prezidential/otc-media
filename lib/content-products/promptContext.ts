/**
 * Compact draft context for Phase 2 content-product prompts (snippets, podcast, sponsorship).
 */
export function draftSummaryForContentProducts(contentJson: Record<string, unknown>): string {
  const title = typeof contentJson.title === "string" ? contentJson.title : "";
  const meta = contentJson.metadata;
  let thesis = "";
  if (meta && typeof meta === "object" && "thesis" in meta && typeof (meta as { thesis: unknown }).thesis === "string") {
    thesis = (meta as { thesis: string }).thesis;
  }
  const hook = Array.isArray(contentJson.hook_paragraphs)
    ? (contentJson.hook_paragraphs as string[]).join("\n\n")
    : "";
  const fresh =
    typeof contentJson.fresh_signals === "string" ? contentJson.fresh_signals : "";
  let deep = typeof contentJson.deep_dive === "string" ? contentJson.deep_dive : "";
  const maxDeep = 3500;
  if (deep.length > maxDeep) deep = deep.slice(0, maxDeep) + "\n[…truncated for prompt size…]";
  const dojo = Array.isArray(contentJson.dojo_checklist)
    ? (contentJson.dojo_checklist as string[]).join("\n- ")
    : "";

  return [
    `Title: ${title}`,
    thesis ? `Thesis: ${thesis}` : "",
    hook ? `Opening hook:\n${hook}` : "",
    fresh ? `Fresh signals (excerpt if long):\n${fresh.slice(0, 4000)}${fresh.length > 4000 ? "\n[…]" : ""}` : "",
    deep ? `Deep dive:\n${deep}` : "",
    dojo ? `From the Dojo:\n- ${dojo}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}
