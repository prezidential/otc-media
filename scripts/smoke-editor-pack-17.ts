/* eslint-disable no-console */
import "dotenv/config";

type Json = any;

const ORIGIN = process.env.ORIGIN || "http://localhost:3000";
const BRAND_PROFILE_ID = process.env.BRAND_PROFILE_ID || "80e0047d-4947-458b-abde-f55894493930";

function assert(cond: any, msg: string) {
  if (!cond) throw new Error(`SMOKE FAIL: ${msg}`);
}

function hasForbiddenRealPhrase(s: string) {
  return /\bthe real (issue|risk|problem|battlefield|gap|exposure)\b/i.test(s);
}

/** Only flags em dash (—) or en dash (–). Hyphenated words are allowed. */
function hasEmOrEnDash(s: string) {
  return /[\u2014\u2013]/.test(s);
}

function titleFormatChecks(titles: string[]) {
  assert(titles.length === 3, "titleOptions must have exactly 3 titles");

  const t1 = titles[0].trim();
  const t2 = titles[1].trim();
  const t3 = titles[2].trim();

  const wc = (s: string) => s.split(/\s+/).filter(Boolean).length;

  // Title 1: 3–7 words
  assert(wc(t1) >= 3 && wc(t1) <= 7, "Title 1 must be 3–7 words");

  // Title 2: 6–12 words and includes while|as|when, not versus
  assert(wc(t2) >= 6 && wc(t2) <= 12, "Title 2 must be 6–12 words");
  assert(/\b(while|as|when)\b/i.test(t2), "Title 2 must include while/as/when");
  assert(!/\bversus\b/i.test(t2), "Title 2 must not include 'versus'");

  // Title 3: 6–12 words and not start with How to
  assert(wc(t3) >= 6 && wc(t3) <= 12, "Title 3 must be 6–12 words");
  assert(!/^how to\b/i.test(t3), "Title 3 must not start with 'How to'");

  // No same first word
  const fw = titles.map((t) => t.trim().split(/\s+/)[0]?.toLowerCase());
  assert(new Set(fw).size === 3, "Titles must not start with the same first word");

  // No forbidden phrase or em/en dash in titles
  for (const [i, t] of titles.entries()) {
    assert(!hasForbiddenRealPhrase(t), `Title ${i + 1} contains forbidden "the real (issue|risk|problem|battlefield|gap|exposure)" phrasing`);
    assert(!hasEmOrEnDash(t), `Title ${i + 1} contains em dash (—) or en dash (–); only hyphens are allowed`);
  }
}

function hookNoveltyChecks(hooks: string[]) {
  assert(hooks.length === 3, "hookOptions must have exactly 3 hooks");

  const h1 = hooks[0];
  const h2 = hooks[1];
  const h3 = hooks[2];

  const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);

  // Hook structures per 17.2
  assert(lines(h1).length === 2, "Hook 1 must be exactly 2 lines (blunt thesis)");
  assert(lines(h2).length >= 2 && lines(h2).length <= 3, "Hook 2 must be 2–3 lines (stat/punch)");
  assert(lines(h3).length >= 3 && lines(h3).length <= 4, "Hook 3 must be 3–4 lines (contrast/tension)");

  // must not all start with same first word
  const fw = hooks.map((h) => lines(h)[0]?.split(/\s+/)[0]?.toLowerCase());
  assert(new Set(fw).size === 3, "Hooks must not start with the same first word");

  // No forbidden phrase or em/en dash in hooks
  for (const [i, h] of hooks.entries()) {
    assert(!hasForbiddenRealPhrase(h), `Hook ${i + 1} contains forbidden "the real (issue|risk|problem|battlefield|gap|exposure)" phrasing`);
    assert(!hasEmOrEnDash(h), `Hook ${i + 1} contains em dash (—) or en dash (–); only hyphens are allowed`);
  }
}

async function main() {
  console.log("Running editorPack smoke test 17.1–17.3...");

  // 1) Hit the endpoint that returns editorPack (whatever route you're using today)
  // If your endpoint is /api/issues/generate and it returns editorPack, use it.
  const res = await fetch(`${ORIGIN}/api/issues/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ brandProfileId: BRAND_PROFILE_ID, leadLimit: 6, includeEditorPack: true }),
  });

  const json: Json = await res.json();
  assert(json.ok === true, "API response ok must be true");
  assert(json.editorPack, "editorPack must be present on response");

  const ep = json.editorPack;

  // 2) Verify lint is active and returns violations when present
  // We can only assert the mechanism exists here:
  assert(Array.isArray(json.lintViolations), "lintViolations must be an array");
  assert(typeof json.lintFixed === "boolean", "lintFixed must be boolean");

  // 3) Verify editorPack has titleOptions + hookOptions
  assert(Array.isArray(ep.titleOptions), "editorPack.titleOptions must be an array");
  assert(Array.isArray(ep.hookOptions), "editorPack.hookOptions must be an array");

  titleFormatChecks(ep.titleOptions);
  hookNoveltyChecks(ep.hookOptions);

  // 4) Draft-level checks: no forbidden phrase, no em/en dash (hyphenated words allowed)
  const draftText = (json.draft || "") as string;
  assert(draftText.length > 100, "draft should be non-trivial");
  assert(!hasForbiddenRealPhrase(draftText), "draft contains forbidden \"the real (issue|risk|problem|battlefield|gap|exposure)\" phrasing");
  assert(!hasEmOrEnDash(draftText), "draft contains em dash (—) or en dash (–); only hyphens are allowed");

  // In bundle mode, also check insider draft
  const insiderDraftText = (json.insiderDraft ?? json.editorPack?.drafts?.insider_access ?? "") as string;
  if (insiderDraftText.length > 0) {
    assert(!hasForbiddenRealPhrase(insiderDraftText), "insiderDraft contains forbidden \"the real (issue|risk|problem|battlefield|gap|exposure)\" phrasing");
    assert(!hasEmOrEnDash(insiderDraftText), "insiderDraft contains em dash (—) or en dash (–); only hyphens are allowed");
  }

  console.log("✅ SMOKE PASS: 17.1–17.3 look good.");
}

main().catch((e) => {
  console.error(String(e?.message || e));
  process.exit(1);
});