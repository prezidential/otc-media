# Cornerstone OS
## System Specification v2.0

Owner: OnTheCorner Media  
Module: Newsroom Engine + LinkedIn Module  
Status: Active Development  
Supersedes: v1.1 (sections marked **[REVISED]** replace v1.1 equivalents; sections marked **[NEW]** are additive)

---

# 1. Core Mission [REVISED]

Cornerstone OS exists to eliminate blank page friction and transform research into structured, voice-consistent, monetizable media assets — for any B2B thought leadership creator.

It must:

- Ingest research
- Extract structured editorial angles
- Generate viewpoint-driven drafts
- Enforce per-creator writing constraints
- Support modular section regeneration
- Persist structured draft objects
- Prepare publish-ready drafts across multiple output channels
- Support multiple creators via workspace-scoped configuration

It is infrastructure, not a chatbot. It is a product, not a single-creator tool.

---

# 2. Design Principles [REVISED]

1. Structured over freeform
2. Modular over monolithic
3. Deterministic over magical
4. Persist state, do not recompute everything
5. Human approval before publish
6. Voice guardrails enforced at system level
7. Replaceable LLM abstraction
8. **Creator-configured, not system-hardcoded** — no creator identity, voice rules, or content types live in system code
9. **API-connected over file import** — wherever external data is available via API, connect; never require file uploads when an API exists
10. **Workspace-scoped by default** — every record, profile, signal, lead, and draft belongs to a workspace

---

# 3. System Architecture [REVISED]

## 3.0 Multi-Tenancy Model

Every entity in the system is scoped to a `workspace_id`. A workspace maps 1:1 to a creator or organization. All API routes require a resolved `workspace_id` (from session or request context). No cross-workspace data access is permitted at the query level.

The `WORKSPACE_ID` env var remains valid for single-workspace development instances. In production SaaS, workspace resolution moves to auth middleware.

---

## 3.1 Research Engine
_No changes from v1.1. Directive configuration remains workspace-scoped via existing `workspace_id` on directives table._

---

## 3.2 Leads Pipeline [REVISED]

Added field: `channel` on `editorial_leads`.

```sql
ALTER TABLE editorial_leads
ADD COLUMN channel TEXT NOT NULL DEFAULT 'newsletter'
CHECK (channel IN ('newsletter', 'linkedin', 'both'));
```

Behavior change: When a lead is approved, the approval UI presents a channel selector. Leads flagged `linkedin` or `both` are eligible for LinkedIn draft generation (Section 3.6). Leads flagged `newsletter` flow exactly as in v1.1 — no existing behavior changes.

All other lead pipeline behavior (generate, approve, deduplication, drafted lifecycle, 14-day window) is unchanged from v1.1.

---

## 3.3 Angle + Draft Engine
_No changes from v1.1._

---

## 3.4 Revision Engine
_No changes from v1.1._

---

## 3.5 Publishing Engine [REVISED]

`/api/publish/status` adds LinkedIn to capability flags:

```json
{
  "beehiiv": false,
  "export_html": true,
  "linkedin": true
}
```

`linkedin` capability reports `true` when the workspace has a valid `linkedin_connection` record (see Section 3.7). The LinkedIn publish path exports formatted post text. Direct LinkedIn API posting is Phase 3 (see Section 8).

---

## 3.6 LinkedIn Draft Engine [NEW]

### Input
- Approved editorial lead with `channel: 'linkedin' | 'both'`
- OR: existing `issue_drafts.content_json.deep_dive` section (extraction path)
- Creator's `brand_profile.linkedin` config (from workspace brand profile)
- Selected `content_type` from creator's configured types

### Behavior
- Generates a `LinkedInDraftObject` using the creator's content type structure and voice config as prompt input
- Lint guardrails run against creator's `forbidden_patterns` plus system-level patterns
- Up to 2 lint retries on failure (same pattern as Revision Engine)
- Editorial bias injected via system prompt (never surfaced in API response)
- `hook_line` is extracted and stored separately for quick review
- For `podcast_bridge` type: `comment_content` field populated with episode link; post text contains no direct link

### Extraction Path
When source is `issue_drafts.content_json.deep_dive`, content type defaults to the first IAM-narrative equivalent in the creator's configured types. Creator can override before generation.

### Output
`LinkedInDraftObject` persisted to `linkedin_drafts` table.

```typescript
type LinkedInDraftObject = {
  content_type: string;           // matches creator's configured content_type.id
  post_text: string;              // full post copy, lint-passed
  hook_line: string;              // first line, extracted for review
  community_question?: string;    // close question if structure requires it
  hashtags: string[];             // max 4, derived from creator's expertise config
  comment_content?: string;       // for podcast bridge — episode link goes here
  word_count: number;
  character_count: number;
  lint_passed: boolean;
  source_lead_id?: string;
  source_issue_id?: string;
  generated_at: string;
};
```

### New API Routes

```
POST /api/linkedin/generate          — generate LinkedIn draft from lead or issue section
POST /api/linkedin/regenerate        — regenerate with instruction (same pattern as issues/regenerate-section)
GET  /api/linkedin/list              — list linkedin_drafts for workspace
POST /api/publish/linkedin           — export formatted post text (Phase 1: returns text; Phase 3: posts via API)
```

### Supabase Schema

```sql
CREATE TABLE linkedin_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  source_lead_id UUID REFERENCES editorial_leads(id),
  source_issue_id UUID REFERENCES issue_drafts(id),
  content_type TEXT NOT NULL,
  content_json JSONB NOT NULL,      -- LinkedInDraftObject
  content TEXT NOT NULL,            -- rendered post text (plain)
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'approved', 'published')),
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

---

## 3.7 Creator Onboarding + LinkedIn Connection [NEW]

### Purpose
Replaces the hardcoded brand profile seed with a creator-configured onboarding flow. Every creator — including the workspace owner — configures their brand profile through this flow. No creator identity, voice rules, or content types are seeded from system code.

### LinkedIn OAuth Connection

The system connects to LinkedIn via OAuth 2.0 to pull creator data. This replaces any file-based import.

**Scopes required:**
- `r_liteprofile` — name, headline, profile URL
- `r_emailaddress` — email
- `w_member_social` — required for future post publishing (Phase 3)
- `r_organization_social` — analytics (requires LinkedIn Marketing API partner status; graceful degradation if unavailable)

**Connection record:**

```sql
CREATE TABLE linkedin_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL UNIQUE,
  linkedin_member_id TEXT NOT NULL,
  access_token TEXT NOT NULL,       -- encrypted at rest
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  scopes TEXT[] NOT NULL,
  profile_snapshot JSONB,           -- name, headline, pulled at connect time
  connected_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

**API routes:**

```
GET  /api/linkedin/auth              — initiates OAuth flow, returns authorization URL
GET  /api/linkedin/callback          — OAuth callback, exchanges code for tokens, stores connection
GET  /api/linkedin/connection        — returns current connection status for workspace
DELETE /api/linkedin/connection      — revokes and removes connection
```

### Onboarding Flow — 5 Steps

**Step 1 — Creator Brief**  
Collected via form. Stored directly in `brand_profiles`.

Fields:
- `creator_name` (string)
- `headline` (string) — their professional positioning line
- `primary_expertise` (string) — e.g. "Identity & Access Management"
- `secondary_expertise` (string[]) — up to 3 additional domains
- `audience_target` (string) — who they write for, e.g. "CISOs, security architects, IAM practitioners"
- `content_mission` (string) — what their content is trying to do

**Step 2 — LinkedIn Profile Pull**  
Triggered automatically after OAuth connection. System calls LinkedIn Profile API and populates `headline` and `creator_name` if not already provided. Creator confirms or edits.

**Step 3 — Top Post Analysis**  
Creator pastes 10–15 of their best-performing LinkedIn posts into a structured text input (no file upload). One post per entry. System sends these to Claude with a structured analysis prompt that returns:

```typescript
type PostAnalysisResult = {
  content_types: DerivedContentType[];   // 3-5 types derived from post patterns
  voice_patterns: VoicePattern[];         // structural patterns found in top posts
  forbidden_patterns: string[];           // things to avoid, inferred from weak posts if provided
  signature_moves: string[];              // what the creator does that works
  example_posts: string[];                // top 3 posts selected as voice reference
};

type DerivedContentType = {
  id: string;                            // slug, e.g. "iam_narrative"
  label: string;                         // human label, e.g. "IAM Narrative"
  suggested_cadence: string;             // e.g. "weekly"
  structure: string[];                   // ordered structural steps
  voice_register: string;                // e.g. "practitioner authority"
  example_post?: string;                 // best example from submitted posts
};
```

Creator reviews and edits derived content types before they are saved. Content types are not locked after onboarding — creators can add, edit, or remove via settings.

**Step 4 — Performance Benchmarks (Optional)**  
If LinkedIn Marketing API analytics are available via the connected OAuth token, the system pulls 90-day engagement data and populates `engagement_benchmarks` automatically.

If analytics are not available via API (Marketing API access not granted), this step is skipped. Benchmarks default to `null` and are populated later as the system accumulates post performance data from the LinkedIn draft lifecycle.

**Step 5 — Brand Profile Generated**  
All of the above is written to `brand_profiles` as a single workspace-scoped record. The creator is taken to the Research console. Onboarding is complete.

---

# 4. Brand Profile Schema [REVISED]

Replaces the hardcoded Identity Jedi seed. All brand profile data is creator-configured via onboarding or settings. `POST /api/brand-profiles/seed` is deprecated — remove after migrating the existing workspace through the onboarding flow.

### Updated Schema

```typescript
type CreatorBrandProfile = {
  id: string;
  workspace_id: string;

  // Step 1 — Creator Brief
  creator_name: string;
  headline: string;
  primary_expertise: string;
  secondary_expertise: string[];
  audience_target: string;
  content_mission: string;

  // Newsletter config (unchanged from v1.1, now explicit)
  newsletter: {
    name: string;
    sections: string[];
    publish_cadence: string;
    distribution_platform: string;   // 'beehiiv' | 'substack' | 'convertkit' | 'other'
    beehiiv_publication_id?: string;
  };

  // Voice config — derived from post analysis (Step 3)
  voice: {
    tone_descriptors: string[];
    forbidden_patterns: string[];    // fed into lint config at generation time
    signature_structures: string[];
    example_posts: string[];         // 3-5 verbatim posts used as voice reference in prompts
  };

  // LinkedIn config — derived from post analysis (Steps 3-4)
  linkedin: {
    content_types: CreatorContentType[];
    engagement_benchmarks: EngagementBenchmarks | null;
    format_constraints: LinkedInFormatConstraints;
  };

  created_at: string;
  updated_at: string;
};

type CreatorContentType = {
  id: string;
  label: string;
  cadence: string;
  structure: string[];
  voice_register: string;
  benchmark_engagement_rate: number | null;
  example_post?: string;
};

type EngagementBenchmarks = {
  avg_engagement_rate: number;
  peak_engagement_rate: number;
  baseline_impressions: number;
  data_period_days: number;
  sourced_at: string;
};

type LinkedInFormatConstraints = {
  max_characters: number;            // default 3000
  paragraph_max_sentences: number;   // default 3
  opening_rule: string;              // e.g. "no preamble — first line must be the hook"
  cta_placement: string;             // e.g. "close only"
};
```

### Supabase Schema Update

```sql
-- brand_profiles table: replace current columns with JSONB config
-- Keep id, workspace_id, created_at, updated_at
-- Add:
ALTER TABLE brand_profiles
  ADD COLUMN creator_name TEXT,
  ADD COLUMN headline TEXT,
  ADD COLUMN primary_expertise TEXT,
  ADD COLUMN secondary_expertise JSONB DEFAULT '[]',
  ADD COLUMN audience_target TEXT,
  ADD COLUMN content_mission TEXT,
  ADD COLUMN newsletter_config JSONB DEFAULT '{}',
  ADD COLUMN voice_config JSONB DEFAULT '{}',
  ADD COLUMN linkedin_config JSONB DEFAULT '{}';
```

---

# 5. Guardrails [REVISED]

Guardrails operate at two levels:

**System-level (apply to all workspaces, all channels):**
- No em dashes
- No en dashes
- No space-dash-space
- No forbidden thesis phrases (existing list)
- No filler or corporate jargon (existing list)

**Creator-level (apply per workspace, sourced from `brand_profile.voice.forbidden_patterns`):**
- Populated during onboarding post analysis
- Editable via settings after onboarding
- Applied to both newsletter and LinkedIn generation

**LinkedIn-specific system patterns (apply to all LinkedIn drafts regardless of creator):**
- No lazy contrast structure: `/that'?s not .+, that'?s (my|our|your)/i`
- No corporate opener: `/^(Great|Excited|Thrilled|Honored|Delighted)/i`
- No mid-post external links (links go in comments for podcast bridge type only)

All guardrail sources are merged at generation time into a single lint config. The lint + auto-rewrite retry behavior (up to 2 retries) is unchanged from v1.1.

---

# 6. MVP Definition [REVISED]

Cornerstone OS must:

1. Support workspace-scoped multi-tenancy (existing)
2. Pull research via RSS directives (existing)
3. Produce editorial-ready leads with channel selection (newsletter | linkedin | both)
4. Generate newsletter drafts from approved leads (existing)
5. Generate LinkedIn drafts from approved leads or newsletter deep dive sections
6. Apply per-creator voice guardrails to all generated content
7. Allow regeneration of individual sections — newsletter and LinkedIn (existing + new)
8. Persist structured drafts — `DraftObject` for newsletter, `LinkedInDraftObject` for LinkedIn
9. Support creator onboarding via API-connected flow (LinkedIn OAuth + post analysis)
10. Export publish-ready content for both channels

Stretch:
11. LinkedIn Marketing API analytics pull (requires Marketing API partner approval)
12. Direct LinkedIn post publishing via API (Phase 3)

---

# 7. Implementation Status [REVISED]

| Component | Status | Notes |
|-----------|--------|-------|
| Research Engine | Implemented | Unchanged from v1.1 |
| Leads pipeline | Implemented | Needs `channel` field addition |
| Thesis + Angle + Draft | Implemented | Unchanged from v1.1 |
| Draft persistence | Implemented | Unchanged from v1.1 |
| Deterministic renderer | Implemented | Unchanged from v1.1 |
| Guardrails — system level | Implemented | Unchanged from v1.1 |
| Guardrails — creator level | Not started | Requires brand profile refactor |
| Guardrails — LinkedIn patterns | Not started | New |
| Revision Engine | Implemented | Unchanged from v1.1 |
| Publishing — HTML + Beehiiv | Implemented | Unchanged from v1.1 |
| Publishing — LinkedIn export | Not started | New |
| Brand profile — generic schema | Not started | Replaces hardcoded seed |
| Creator onboarding flow | Not started | New |
| LinkedIn OAuth connection | Not started | New |
| Post analysis + content type derivation | Not started | New |
| LinkedIn Draft Engine | Not started | New |
| LinkedIn Revision Engine | Not started | New |
| linkedin_drafts table | Not started | New |
| linkedin_connections table | Not started | New |
| Manual topic injection | Implemented | Unchanged from v1.1 |
| Draft history | Implemented | Unchanged from v1.1 |
| Test suite | Implemented | 143+ tests; expand for new routes |
| UI — LinkedIn tab on Issues page | Not started | New |
| UI — Onboarding flow | Not started | New |
| UI — LinkedIn draft management | Not started | New |

---

# 8. Roadmap [REVISED]

## Phase 1 — Brand Profile Refactor + LinkedIn Foundation
- Deprecate `POST /api/brand-profiles/seed`
- Implement generic `CreatorBrandProfile` schema in Supabase
- Build creator onboarding flow (Steps 1–5)
- Implement LinkedIn OAuth connection (`/api/linkedin/auth`, `/api/linkedin/callback`, `/api/linkedin/connection`)
- Add `channel` field to `editorial_leads`
- Add `linkedin_connections` and `linkedin_drafts` tables
- Add LinkedIn-specific lint patterns to guardrails
- Migrate existing workspace through onboarding flow; validate brand profile parity with v1.1 seed

## Phase 2 — LinkedIn Draft Engine
- Build `/api/linkedin/generate`
- Build `/api/linkedin/regenerate`
- Build `/api/linkedin/list`
- Build `/api/publish/linkedin` (formatted text export)
- Add LinkedIn tab to Issues page (extraction path from newsletter deep dive)
- Add channel selector to Leads approval UI
- Add LinkedIn draft management UI
- Expand test suite for all new routes

## Phase 3 — Direct Publishing + Analytics
- LinkedIn post publishing via API (`w_member_social` scope)
- LinkedIn Marketing API analytics pull (requires partner approval)
- Auto-populate `engagement_benchmarks` from API data
- Feedback loop: published post performance updates creator benchmarks

## Phase 4 — Multi-Brand + Platform Expansion
- Multi-brand orchestration (multiple brand profiles per workspace)
- Revenue alignment scoring
- Semi-autonomous issue drafting with confidence scoring
- Additional output channels (Twitter/X, Substack Notes)

---

# 9. Migration Notes [NEW]

### Migrating the Existing Workspace (Identity Jedi)

The existing hardcoded brand profile seed must be migrated to the generic schema before Phase 2 work begins. Steps:

1. Run the new onboarding flow against the existing workspace
2. In Step 3, use the top-performing posts identified in the LinkedIn audit as the post analysis input. Content types to configure:

| id | label | cadence | voice_register |
|----|-------|---------|----------------|
| `iam_narrative` | IAM Narrative | weekly | practitioner authority |
| `field_cto_perspective` | Field CTO Perspective | biweekly | humble authority |
| `podcast_bridge` | Podcast Bridge | monthly | conversational expert |
| `community_milestone` | Community Milestone | quarterly | personal and warm |

3. Voice forbidden patterns to configure (sourced from audit):
   - No em dashes (system-level, already enforced)
   - No lazy contrast structure `that's not X, that's my Y`
   - Specific over abstract — flag overly generic claims in lint
   - No corporate opener

4. Confirm generated brand profile matches v1.1 behavior for newsletter generation before deprecating seed
5. Remove `POST /api/brand-profiles/seed` route and seed data file

---

End of Specification v2.0
