# Cornerstone OS

AI-powered newsroom engine by [OnTheCorner Media](https://github.com/prezidential/otc-media). Cornerstone automates the editorial pipeline for the **Identity Jedi Newsletter** — from research ingestion through draft generation — so the editor starts with a structured, voice-consistent draft instead of a blank page.

## What It Does

| Stage | Description |
|-------|-------------|
| **Research** | Ingests RSS feeds across 8 directives (Identity + AI, Agentic AI Security, CIEM, ITDR, etc.) covering 13+ cybersecurity sources |
| **Leads** | Generates editorial leads from signals via Claude, with citation enforcement and human approval workflow |
| **Drafting** | Produces full newsletter issues (Title, Hook, Fresh Signals, Deep Dive, Dojo Checklist, Promo, Close) with thesis-driven editorial angles |
| **Revision** | Regenerates individual sections with lint guardrails and editorial bias injection |

## Tech Stack

- **Framework:** Next.js 16 (App Router, TypeScript)
- **AI:** Anthropic Claude (`claude-sonnet-4-20250514`)
- **Database:** Supabase (hosted PostgreSQL)
- **UI:** Tailwind CSS v4, Lucide React, JetBrains Mono
- **Testing:** Vitest (136+ tests)

## Getting Started

### Prerequisites

- Node.js 20+
- A Supabase project with the required tables (see `lib/supabase/schema-issue_drafts.sql`)
- An Anthropic API key

### Environment Variables

Create `.env.local` in the project root:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-anon-key
SUPABASE_SECRET_KEY=your-service-role-key
ANTHROPIC_API_KEY=your-anthropic-key
WORKSPACE_ID=your-workspace-uuid
```

### Install & Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### First-Time Setup

1. **Seed brand profile:** `POST /api/brand-profiles/seed` (creates the Identity Jedi Newsletter profile)
2. **Seed directives:** `POST /api/research/seed-directives` (creates the 8 research directives)
3. **Seed revenue items:** `POST /api/revenue/seed` (creates default promo items)
4. **Ingest signals:** Go to Research → click "Run All Directives"
5. **Generate leads:** Go to Leads → select brand profile → click "Generate Leads"
6. **Approve leads:** Review and approve leads on the Leads page
7. **Generate draft:** Go to Issues → configure steering → click "Generate Issue Draft"

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server (port 3000) |
| `npm run build` | Production build |
| `npm run lint` | Run ESLint |
| `npm test` | Run Vitest test suite |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:coverage` | Run tests with V8 coverage |

## Project Structure

```
app/
├── components/          # Sidebar, page header
├── page.tsx             # Signals (homepage)
├── research/page.tsx    # Research console
├── leads/page.tsx       # Editorial leads
├── issues/page.tsx      # Issue draft generation
└── api/
    ├── ingest/rss/          # Single RSS feed ingest
    ├── research/            # Directives, run-directives, run-all
    ├── leads/               # Generate, list, approve
    ├── issues/              # Generate, latest, regenerate-section
    ├── brand-profiles/      # List, seed
    ├── revenue/             # List, seed, recommend
    ├── signals/list/        # List captured signals
    └── runs/list/           # List ingest/generation runs

lib/
├── draft/               # DraftObject type, renderer, lint, parser
├── leads/               # Zod schema for lead validation
├── llm/                 # Claude client factory
├── research/            # RSS feed map (8 directives, 13+ sources)
├── supabase/            # Server + browser clients
└── utils.ts             # cn() utility

__tests__/               # 136+ Vitest tests (unit + API route)
docs/                    # System specification v1.1
```

## Architecture

See [`docs/cornerstone-system-spec-v1.md`](docs/cornerstone-system-spec-v1.md) for the full system specification including design principles, architecture details, guardrails, and roadmap.

## License

Private — OnTheCorner Media.
