

Cursor Prompt
You are working on Cornerstone OS (otc-media). Goal: implement MVP B so we can draft a newsletter and regenerate individual sections without rewriting the whole draft.

Constraints:
- Do not redesign UI.
- Do not refactor unrelated modules.
- Keep existing lint rules: no em dash, no forbidden phrases.
- Hyphenated words are allowed. Only block em/en dashes.
- Avoid lazy contrast structures in generated content.
- Keep existing issue draft generation behavior working.

Tasks: MVP B
1) Update persistence so drafts are stored as structured JSON.
   - Preferred approach: add a jsonb column to issue_drafts named content_json (keep existing content text for backward compatibility).
   - If migrations are not present, add a SQL snippet to docs or lib/supabase/tasks.md that creates/updates the table safely.

2) Update app/api/issues/generate/route.ts:
   - Build a structured draft object:
     {
       title: string,
       hook_paragraphs: string[],
       deep_dive: string,
       dojo_checklist: string[],
       sources: string[],
       metadata: { thesis?: string, model?: string }
     }
   - Save it to issue_drafts.content_json.
   - Optionally render a markdown string and also save to issue_drafts.content.
   - Preserve existing lint checks. If violations occur, regenerate or sanitize as the code currently does.

3) Add a new endpoint: app/api/issues/regenerate-section/route.ts:
   - POST body: { draftId: string, section: "title"|"hook"|"deep_dive"|"dojo_checklist", instruction: string }
   - Fetch the draft JSON from Supabase.
   - Regenerate ONLY the requested section using Claude, with access to the original research context and the rest of the draft for continuity.
   - Re-run lint on the regenerated section. If violations occur, fix and retry up to 2 times.
   - Replace the section in content_json, and also update rendered markdown in content if you implemented it.
   - Return updated draft JSON and rendered markdown.

4) Update app/api/issues/latest/route.ts:
   - Return both draft markdown (content) and structured draft JSON (content_json) if present.

Deliverables:
- Code changes compile.
- Minimal manual test instructions in docs or README:
  - Generate a draft
  - Regenerate deep_dive with an instruction
  - Confirm only that section changes

---

## MVP B manual test (after implementation)

1. **Schema**: If you see "Draft generated (not saved: table may be missing)", create the table in Supabase SQL editor. Run the contents of **lib/supabase/schema-issue_drafts.sql** (creates `issue_drafts` and adds `content_json`). If the table already exists, run only: `ALTER TABLE issue_drafts ADD COLUMN IF NOT EXISTS content_json jsonb;`

2. **Generate a draft**: On /issues, select brand profile, choose "Full Issue", click "Generate Issue Draft". Wait for completion. Confirm draft appears and message says "Draft generated and saved."

3. **Regenerate one section**: Get the latest draft id from `GET /api/issues/latest` (response has `id`). Then:
   - `POST /api/issues/regenerate-section` with body:
     `{ "draftId": "<id from step 2>", "section": "deep_dive", "instruction": "Make the closing paragraph more direct and less abstract." }`
   - Confirm response has `ok: true`, `draft` (full markdown), and `content_json`. Open the draft text and confirm only the Deep Dive section changed; other sections (Title, Hook, Fresh Signals, From the Dojo, Promo, Close) are unchanged.