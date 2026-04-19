# Handoff: Cornerstone OS — Dashboard (Studio Direction)

**Canonical product spec:** [`../cornerstone-system-spec-v2.md`](../cornerstone-system-spec-v2.md) **§3.15** (v2.8) — Studio dashboard UX contract. This folder remains the **visual and interaction reference** (tokens, layout, components, mock flows).

## Overview

This package contains the design reference for the **Cornerstone OS home dashboard**, "Studio" direction. Cornerstone OS is a SaaS platform for B2B creators (journalists, podcasters, newsletter operators, small agencies) that runs a Research → Leads → Issues → Outlines content pipeline.

The dashboard is the user's daily home base: they see their pipeline health at a glance, ingest RSS feeds, run/review research directives, approve or pass on leads, filter fresh signals, and navigate to any stage of their workflow.

---

## About the Design Files

The files in this bundle (`DirStudio.jsx`, `design_reference.html`) are **HTML/React prototypes — design references only**. They are not production code. Your task is to **recreate these designs inside the existing Cornerstone OS codebase**, matching its framework, routing, data layer, and component conventions. If no frontend framework is established yet, React (with a CSS-in-JS or Tailwind setup) is the recommended choice given the component complexity.

**Fidelity: High-fidelity.** Colors, typography, spacing, layout, interactions, and copy are all intentional and should be matched precisely.

Open `design_reference.html` in a browser to interact with the prototype. The Studio direction is the first artboard (scroll right or zoom out on the canvas).

---

## Screens / Views

### Dashboard Home (`/` or `/dashboard`)

The primary home screen. Single-page layout with a persistent left sidebar and a scrollable main content area.

---

## Layout

```
┌─────────────────────────────────────────────────────────┐
│  Sidebar (230px fixed)  │  Main content (flex: 1)        │
│                         │                                 │
│  Logo + wordmark        │  Header row (greeting + CTA)    │
│  Nav links (7 items)    │  Pipeline rail                  │
│  Daily summary (bottom) │  2-col grid (Ingest + Nudge)    │
│                         │  Signals list                   │
└─────────────────────────────────────────────────────────┘
```

- Overall: `display: flex; overflow: hidden; height: 100vh`
- Sidebar: `width: 230px; flex-shrink: 0`
- Main: `flex: 1; overflow-y: auto; padding: 28px 44px 60px`

---

## Design Tokens

### Colors — Light Mode (default)

| Token | Hex | Usage |
|---|---|---|
| `--bg` | `#F5EFE4` | Page background (warm cream) |
| `--panel` | `#FBF7EE` | Cards, sidebar |
| `--ink` | `#1F1A14` | Primary text, headings |
| `--sub` | `#6B5F4E` | Secondary text, metadata |
| `--line` | `#E4D9C2` | Dividers, borders |
| `--accent` | `#C8571E` | Burnt orange — CTAs, heat bars, "NEEDS YOU", highlights |
| `--accent2` | `#3F6B45` | Forest green — "Promote to lead" button, positive actions |
| `--chip` | `#EBDFC5` | Tag backgrounds, hover state on rows |
| `--shadow` | see below | Card elevation |

**Card shadow:**
```css
box-shadow: 0 1px 0 rgba(30,20,10,0.04), 0 14px 30px -18px rgba(60,40,10,0.18);
```

### Colors — Dark Mode

| Token | Hex |
|---|---|
| `--bg` | `#1A1612` |
| `--panel` | `#221D16` |
| `--ink` | `#F2E9D7` |
| `--sub` | `#9C8E78` |
| `--line` | `#322B22` |
| `--accent` | `#E07A3C` |
| `--accent2` | `#8FB58A` |
| `--chip` | `#2A2319` |

### Typography

| Role | Font | Size | Weight | Notes |
|---|---|---|---|---|
| Display / page title | Instrument Serif | 52px | 400 | `font-style: italic` on key phrase; `letter-spacing: -0.5px` |
| Section headings | Instrument Serif | 22–24px | 400 | `font-style: italic` |
| Pipeline numbers | Instrument Serif | 44px | 400 | `font-style: italic` |
| Body / nav / buttons | Geist | 13–15px | 400–500 | System fallback: `-apple-system, system-ui, sans-serif` |
| Metadata / tags / timestamps | JetBrains Mono | 9–12px | 400 | `letter-spacing: 1–2px; text-transform: uppercase` |
| Feed URL input | JetBrains Mono | 13px | 400 | |

**Google Fonts import:**
```html
<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Geist:wght@300..700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
```

### Spacing

The design uses an informal 4px base unit. Common values: `4 8 10 12 14 16 18 20 22 24 28 32 44 60`.

### Border Radius

| Context | Value |
|---|---|
| Cards / panels | `14px` |
| Buttons (pill) | `999px` |
| Buttons (fill) | `8px` |
| Topic tags | `999px` |
| Logo icon | `8px` |
| Heat bar fill | `2px` |

---

## Components

### Sidebar

- `width: 230px`, `background: var(--panel)`, `border-right: 1px solid var(--line)`
- `padding: 22px 18px`, `display: flex; flex-direction: column; gap: 28px`

**Logo lockup:**
- 34×34px square, `border-radius: 8px`, gradient fill: `linear-gradient(135deg, #C8571E 0%, #3F6B45 100%)`
- Italic "C" in Instrument Serif at 19px, color `#FBF7EE`
- Wordmark: "Cornerstone" in Instrument Serif 19px italic / "OS · Studio" in JetBrains Mono 10px, `letter-spacing: 2.5px`, uppercase, color `--sub`

**Nav items** (7 total):
```
◐  Dashboard   (active)
≈  Signals
◇  Leads        [badge: "12"]
▤  Issues       [badge: "3"]
↳  Outlines
✦  Brand
⌁  Research
```
- Each: `padding: 9px 12px; border-radius: 6px; font-size: 14px`
- Active: `background: var(--chip); color: var(--ink); font-weight: 500`
- Inactive: `color: var(--sub); font-weight: 400`
- Icon: 14px wide, `opacity: 0.75`, left-aligned
- Badge: JetBrains Mono 11px, `color: var(--sub)`, right-aligned, no background

**Daily summary (bottom of sidebar):**
- Pushed to `margin-top: auto`
- JetBrains Mono, 11px, `color: var(--sub)`, `line-height: 1.6`
- Label: `font-size: 9px; letter-spacing: 1.2px; text-transform: uppercase; margin-bottom: 6px`
- 3 stat lines: "27 signals ingested", "2 leads to approve", "1 issue drafting"

---

### Header Row

- `display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 28px`

**Greeting:**
- Date: JetBrains Mono 11px, `letter-spacing: 2px`, uppercase, `color: var(--sub)`, `margin-bottom: 6px`
- `<h1>`: Instrument Serif, `font-size: 52px; line-height: 1; letter-spacing: -0.5px; font-weight: 400`
- Italic phrase (e.g. "You have ideas waiting.") in `color: var(--accent)`

**Header CTAs:**
- "⌘K Search": transparent bg, `border: 1px solid var(--line)`, `border-radius: 999px`, Geist 13px, `padding: 9px 14px`
- "+ New issue": `background: var(--ink); color: var(--bg)`, `border-radius: 999px`, Geist 13px 500 weight, `padding: 9px 16px`

---

### Pipeline Rail

Full-width card showing the 4-step flow: Research → Leads → Issues → Outlines.

- `background: var(--panel); border: 1px solid var(--line); border-radius: 14px; padding: 22px 26px; margin-bottom: 24px`
- Header row: `justify-content: space-between`  — left: "End-to-end flow" in mono uppercase 10px; right: last-ingest metadata in 12px

**Each step cell:**
- `flex: 1`, separated by `→` divider (18px, `color: var(--sub)`, centered in a 40px container)
- Big number: Instrument Serif 44px italic. Active step (Leads): `color: var(--accent)`
- Label: Geist 14px 500
- Sub-label: Geist 12px `color: var(--sub)`
- "NEEDS YOU" pill on Leads cell: JetBrains Mono 9px, `letter-spacing: 1.5px`, bg `var(--accent)`, color `#FBF7EE`, `padding: 3px 7px; border-radius: 3px`, `position: absolute; top: -6px; right: 16px`

**Data:**
| Step | Count | Sub-label |
|---|---|---|
| Research | 200 | signals |
| Leads | 12 | to approve |
| Issues | 3 | in draft |
| Outlines | 8 | active |

---

### Ingest Feed Card

- `grid-column: 1` in the 2-col grid (ratio `1.3fr 1fr`)
- `background: var(--panel); border: 1px solid var(--line); border-radius: 14px; padding: 20px 22px`

**Header:** "Ingest a feed" in Instrument Serif 22px italic (left) + "RSS · ATOM · Sitemap" in mono 10px uppercase (right)

**Input row:**
- Text input: `flex: 1`, mono 13px, `background: var(--bg)`, `border: 1px solid var(--line)`, `border-radius: 8px`, `padding: 11px 14px`
- Default value: `https://www.darkreading.com/rss.xml`
- Button: Geist 13px 500, `padding: 0 20px`, `border-radius: 8px`, `min-width: 120px`
  - Idle: `background: var(--accent); color: #FBF7EE` — label "Ingest feed"
  - Ingesting: `background: var(--chip); color: var(--sub)` — label "Ingesting… {count}"
  - Progress bar: `position: absolute; bottom: 0; left: 0; height: 2px; background: rgba(251,247,238,0.6)` — `width` animates from 0→100% as count increases

**Recent feeds row:**
- 5 pill chips: JetBrains Mono 11px, `color: var(--sub)`, `padding: 4px 9px; background: var(--chip); border-radius: 999px`
- Feeds: "darkreading", "mit tech review", "the verge", "bloomberg", "stratechery"
- Each prefixed with "⟲ "

---

### "The Cornerstone" Nudge Card

- `grid-column: 2`
- `background: linear-gradient(160deg, rgba(200,87,30,0.085) 0%, transparent 60%), var(--panel)` — subtle orange tint
- `border: 1px solid var(--line); border-radius: 14px; padding: 20px 22px`

**Label:** "The cornerstone" in JetBrains Mono 10px uppercase `letter-spacing: 2px color: var(--sub)`

**Body copy:** Instrument Serif 26px, `line-height: 1.15`. Key number/phrase in italic `color: var(--accent)`.

Example copy: *"Two leads have been waiting **four days**. Approve them to keep Issue 41 on pace."*

**CTA buttons:**
- Primary: "Review leads →" — `background: var(--ink); color: var(--bg)`, `border-radius: 999px`, 12px, `padding: 7px 13px`
- Secondary: "Snooze" — transparent, `border: 1px solid var(--line)`, same sizing

---

### Signals List

Full-width card below the 2-col grid.

- `background: var(--panel); border: 1px solid var(--line); border-radius: 14px; padding: 20px 22px`

**List header:**
- "Latest signals" in Instrument Serif 24px italic
- Signal count in JetBrains Mono 11px `color: var(--sub)` e.g. "6 of 200"
- Topic filter pills: JetBrains Mono 11px, `letter-spacing: 0.5px`, `padding: 5px 10px; border-radius: 999px`
  - Active: `background: var(--ink); color: var(--bg); border: 1px solid var(--ink)`
  - Inactive: transparent, `color: var(--sub)`, `border: 1px solid var(--line)`
  - Topics: `All · AI · Biotech · Robotics · Climate · Media · Consumer`

**Each signal row:**
```
[ID]  [Title + source/date]  [Topic chip]  [Heat bar]  [→ Lead button]
```
- Grid: `grid-template-columns: 32px 1fr auto auto 80px; gap: 16px; padding: 14px 4px`
- `border-bottom: 1px solid var(--line)`
- Hover: `background: var(--chip)` — transition 120ms
- **ID**: JetBrains Mono 11px `color: var(--sub)`, right-aligned, zero-padded to 3 digits
- **Title**: Geist 14px `line-height: 1.35`
- **Source/date**: JetBrains Mono 11px `color: var(--sub)`, `margin-top: 3px` — `{source} · {date}`
- **Topic chip**: JetBrains Mono 10px uppercase `letter-spacing: 1px`, `padding: 3px 8px; background: var(--chip); border-radius: 3px`
- **Heat bar**: label "heat" in 10px mono + 50×4px bar, `background: var(--chip)`, fill `background: var(--accent)`, `border-radius: 2px`
- **→ Lead button**: visible only on row hover (`opacity: 0 → 1`, transition 120ms). `background: var(--accent2); color: #FBF7EE; border-radius: 999px; font-size: 11px; padding: 4px 10px; font-weight: 500`

**Signal data (mock — replace with real API):**
```json
[
  { "id": 1, "title": "The Download: an exclusive Jeff VanderMeer story and AI models too scary to release", "source": "MIT Technology Review", "date": "4/10", "topic": "AI", "heat": 92 },
  { "id": 2, "title": "What's in a name? Moderna's \"vaccine\" vs. \"therapy\" dilemma", "source": "MIT Technology Review", "date": "4/10", "topic": "Biotech", "heat": 67 },
  { "id": 3, "title": "Inside the lab teaching robots to fold laundry (finally)", "source": "The Verge", "date": "4/09", "topic": "Robotics", "heat": 54 },
  { "id": 4, "title": "Why the next great search engine might not have a search box", "source": "Wired", "date": "4/09", "topic": "AI", "heat": 88 },
  { "id": 5, "title": "Climate startups are quietly buying up farmland", "source": "Bloomberg", "date": "4/08", "topic": "Climate", "heat": 73 },
  { "id": 6, "title": "A field guide to the new generation of open-source LLMs", "source": "Ars Technica", "date": "4/08", "topic": "AI", "heat": 81 },
  { "id": 7, "title": "The quiet death of the smart home hub", "source": "The Verge", "date": "4/07", "topic": "Consumer", "heat": 42 },
  { "id": 8, "title": "How three friends built a $40M newsletter in 18 months", "source": "The Information", "date": "4/07", "topic": "Media", "heat": 94 }
]
```

---

## Interactions & Behavior

### Ingest Feed
1. User edits the URL input and clicks "Ingest feed"
2. Button label changes to "Ingesting… {n}" — counter increments roughly every 80–90ms up to a realistic total (e.g. 27)
3. A 2px progress bar animates across the bottom of the button, width `= (count / total) * 100%`
4. At completion, button returns to idle state
5. Sidebar daily summary counter should increment

### Filter by Topic (Signals)
- Clicking a topic pill filters the signal list client-side
- "All" shows every signal
- Transition: list re-renders instantly (no animation needed unless desired)

### Promote to Lead (hover action)
- On `mouseenter` on a signal row: background → `var(--chip)`, "→ Lead" button fades in (`opacity: 0 → 1`, `transition: 120ms`)
- On `mouseleave`: reverse
- On click: POST to API to promote signal to lead; optimistic UI — remove from signals list, increment Leads count in pipeline rail

### "The Cornerstone" nudge
- Static on load; driven by backend logic (most time-sensitive action)
- "Review leads →" navigates to `/leads`
- "Snooze" dismisses card for 24h (persist in user preferences)

### Dark mode toggle
- Controlled by user preference, persisted to `localStorage` key `cornerstone_dark`
- Applies theme tokens globally via CSS custom properties or context

---

## State

| Variable | Type | Description |
|---|---|---|
| `signals` | `Signal[]` | List of ingested signals, paginated |
| `topicFilter` | `string` | Active topic filter; `"All"` = no filter |
| `pipeline` | `PipelineStats` | Counts for each stage |
| `activeIssue` | `Issue` | Current in-draft issue |
| `ingesting` | `boolean` | Ingest in progress |
| `dark` | `boolean` | Dark mode preference |

---

## Assets

No image assets. The logo mark is a CSS gradient square with a text character. All icons are unicode glyphs (◐ ≈ ◇ ▤ ↳ ✦ ⌁ → ⟲).

---

## Files in This Package

| File | Description |
|---|---|
| `README.md` | This document |
| `DirStudio.jsx` | Full React prototype of the Studio dashboard (self-contained, with mock data inline) |
| `SharedData.jsx` | Mock data constants used by the prototype |
| `design_reference.html` | Browser-runnable canvas with all three directions — open this to interact with the live prototype |

> **Note:** `design_reference.html` requires an internet connection to load fonts and React from CDN. Open it locally in Chrome or Safari.

---

## Implementation Notes for Claude Code / Cursor

- The prototype uses inline React state and mock data. Replace these with your real data-fetching layer (React Query, SWR, tRPC, etc.)
- The sidebar nav items should use your router's `<Link>` component with active-state detection
- The "heat" score and "novelty" score are properties of the Signal model — make sure the API returns them
- The Ingest feed feature is a form POST; wire it to your existing feed ingestion endpoint
- The Pipeline rail counts come from a stats endpoint — consider a `/api/dashboard/stats` summary endpoint
- The greeting headline ("Good morning. You have ideas waiting.") should be dynamic: time-of-day + a backend-computed motivational line based on pending actions
- The "The Cornerstone" nudge should be driven by a priority-sorted list of pending actions from the backend
- For the dark mode token swap, CSS custom properties on `:root` / `[data-theme="dark"]` is the cleanest approach
