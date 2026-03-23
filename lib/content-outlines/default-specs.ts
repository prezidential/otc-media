import type { InsiderOutlineSpec, NewsletterOutlineSpec } from "./types";

/** Default newsletter assembly prompt (Identity Jedi). Edit via content_outlines.spec_json or seed. */
export const DEFAULT_NEWSLETTER_OUTLINE: NewsletterOutlineSpec = {
  version: 1,
  userPromptTemplate: `You are assembling a single newsletter issue draft in Identity Jedi (IDJ) voice.
Use only the approved leads and their listed Sources URLs. Do not invent any sources or citations.

Primary Thesis:
{{PRIMARY_THESIS}}

Every section must reinforce this thesis. Avoid recap.

Editorial Steering Inputs (adjust Opening Hook, Deep Dive, and From the Dojo to match these):
{{STEERING_BLOCK}}

{{ANGLE_BLOCK}}

Approved leads (use 3-6 for Fresh Signals):
{{LEADS_BLOCK}}

Promo slot text (insert verbatim in the Promo Slot section):
---
{{PROMO_TEXT}}
---

Before writing the newsletter:

1. Extract the shared pattern across the approved leads.
2. Express that pattern as a single clear thesis about identity.
3. The thesis must be declarative, not descriptive.
4. Use that thesis to craft the Opening Hook.

Opening Hook structure (must follow this template):

Line 1: A shift statement. Use one of these forms:
- "This week, something shifted."
- "Something just changed."
- "We just crossed a line."

Line 2–3: Two short contrast lines that begin with "Not". Example:
"Not in a hype-cycle way."
"Not in a vendor-demo way."

Line 4: One escalation line that names the stakes for identity. No article references.

Line 5 (required): One short invitation or directive line:
"Let's talk about it."
or
"Here's what matters."
or
"Pay attention."

Do not reuse any exact hook lines from earlier drafts.
Write fresh phrasing each time while keeping the structure.

Rules:
- 5 lines minimum. 7 lines maximum.
- Each line is one sentence.
- Do not summarize the news.
- Do not mention specific vendors or articles.
- No dashes inside sentences.
- Avoid "This isn't", "isn't just", "The real problem isn't".
- Vary sentence starters. Keep paragraphs to 1-2 sentences.

Produce a complete issue draft as plain text with these sections in order. Use clear section labels.

1) Title
- Max 6 words.
- No punctuation.
- Must reflect the thesis.
- No corporate phrasing.
2) Opening Hook (use the hook_line as the first line, then 2-3 short paragraphs)
3) Fresh Signals (use 3-6 leads from above). Structure the Fresh Signals section in TWO parts inside the same markdown section:

Part A — Synoptic opener (before listing individual items):
- Write 2-4 short paragraphs (or one block of 4-6 tight sentences) explaining why this basket of signals matters together this week.
- Name the shared pattern across them. Do not walk source-by-source here.
- Do not paste URLs in Part A.

Part B — Read next (one subsection per selected lead):
For each lead, use:
**[Title or angle line]**
One line telling the reader why they should open the sources (specific, not generic).
Then Sources:
- url
- url
Use only URLs from that lead's Sources list. Do not invent URLs.

The fresh_signals JSON field MUST be markdown starting with the header **Fresh Signals** on its own line, then Part A, then Part B.

4) Deep Dive (600–900 words, editorial, IDJ voice)

Structure:

Paragraph 1–2:
- Expand the thesis immediately.
- Do not recap articles.
- Establish authority and posture.

Middle section:
- Identify the core classification mistake identity teams are making.
- Explain the consequence of that mistake.
- Reference at most TWO specific signals from Fresh Signals.
- Everything else must be framed as pattern, not reporting.

Include:
- Exactly 3 bold declarative statements spaced throughout.
- One uncomfortable truth about identity programs.
- One reframing sentence that changes how the reader should think about the problem.

Tone rules:
- No advisory consulting tone.
- No "organizations should consider…"
- No recap language like "This article shows…"
- Keep paragraphs 1–2 sentences max.
- Maintain escalation.
- End with strategic clarity, not summary.
5) From the Dojo (exactly 5 bullets, practical, no fluff)
6) Promo Slot (the promo text above, verbatim, no changes)
7) Close (short sign-off + CTA: Subscribe)

Voice: No dashes inside sentences (no hyphen, em dash, or en dash). Avoid "This isn't", "isn't just", "The real problem isn't". Vary sentence starters. Keep paragraphs to 1-2 sentences.

Output valid JSON only. No markdown code fence. No commentary. Use this exact shape (all strings; hook_paragraphs and dojo_checklist are arrays of strings):
{
  "title": "Max 6 words, no punctuation, reflects thesis",
  "hook_paragraphs": ["First short paragraph.", "Second paragraph.", "Optional third."],
  "fresh_signals": "**Fresh Signals**\\n\\nPart A paragraphs...\\n\\n**First signal title**\\n\\nOne line why read...\\n\\nSources:\\n- https://...\\n\\n**Second title**\\n\\n...",
  "deep_dive": "Full Deep Dive prose (600-900 words). Use **bold** for 3 declarative statements.",
  "dojo_checklist": ["First bullet.", "Second.", "Third.", "Fourth.", "Fifth."]
}
Do not include promo_slot or close (they are added separately). Use only URLs from the leads for Sources.`,
  systemPromptSuffix: `Rules:
- No dashes inside sentences (no '-', '—', '–').
- Avoid "This isn't", "isn't just", "The real problem isn't".
- Vary sentence starters.
- Keep paragraphs 1-2 sentences.
Fresh Signals: Part A is synopsis only (no URLs). Part B lists each signal with Sources formatted as:
Sources:
- url
- url
Do not invent sources.
Output strict JSON only. No code fences.`,
};

export const DEFAULT_INSIDER_OUTLINE: InsiderOutlineSpec = {
  version: 1,
  userPromptTemplate: `You are writing an Insider Access artifact for experienced IAM practitioners.

Primary Thesis:
{{PRIMARY_THESIS}}

Every section must reinforce this thesis. Avoid recap.

Editorial Steering Inputs:
{{STEERING_BLOCK}}

{{NEWSLETTER_SECTION}}

Allowed citation URLs (you may only cite these as Sources if you include URLs; do not invent links):
{{ALLOWED_URLS}}

Approved leads (context and URL grounding — use only allowed URLs above for any Sources):
{{LEADS_BLOCK}}

Produce ONLY the Insider Access artifact as plain text with these sections in order. Use clear section labels.

1) Title (max 8 words, no punctuation)
2) What Most Teams Miss (2-4 paragraphs)
3) What I Would Actually Change (2-4 paragraphs)
4) Vendor Reality Check (direct, opinionated, no brand bashing)
5) Tactical Architecture Shift (3-5 bullets)

Rules:
- When newsletter JSON is provided, build on the public issue: add practitioner depth, tactics, and framing that were not appropriate for the open newsletter. Do not paste large blocks from the newsletter verbatim.
- No hook. No invitation lines. No promo. No recap tone.
- Assume audience is experienced IAM practitioner. Go deeper than public editorial.
- Reference at most 2 signals by name. Use only URLs from the allowed list; do not invent sources.
- No dashes inside sentences (no hyphen, em dash, or en dash).
- Maintain Identity Jedi posture but more surgical and less rhetorical.
- Keep paragraphs to 1-2 sentences.

Output only the artifact text. No meta commentary.`,
  systemPromptTemplate: `You write in Identity Jedi voice: surgical, direct, no fluff. Insider Access is for experienced IAM practitioners. Do not invent sources; cite only URLs from the allowed list. No dashes inside sentences.`,
};
