# Handoff: Cornerstone OS — Full Inner Pages (Studio Direction)

## Overview

This package documents all 8 pages of the Cornerstone OS dashboard redesign in the **Studio direction**. The design system is warm editorial — Instrument Serif display, Geist body, JetBrains Mono for metadata, burnt orange CTAs, forest green for positive/approve actions, warm cream panels on a cream background.

**ACE (Autonomous Content Engine)** has a special dark "engine room" visual identity — espresso background, amber accents, glowing SVG ring balance chart.

---

## About the Design Files

The files in this bundle are **HTML/React prototypes — design references only**, not production code. Recreate them inside the existing Cornerstone OS codebase using its established framework, routing, and data layer. All prototypes are fully interactive — open `Cornerstone OS.html` in a browser and navigate via the sidebar.

**Fidelity: High-fidelity.** Colors, typography, spacing, interactions, and copy are all intentional.

---

## Design Tokens

### Studio (light) — used on all pages except ACE

| Token | Hex | Usage |
|---|---|---|
| `--bg` | `#F5EFE4` | Page background |
| `--panel` | `#FBF7EE` | Cards, sidebar |
| `--ink` | `#1F1A14` | Primary text |
| `--sub` | `#6B5F4E` | Secondary text, metadata, disabled |
| `--line` | `#E4D9C2` | Borders, dividers |
| `--accent` | `#C8571E` | Burnt orange — ALL primary CTAs |
| `--accent2` | `#3F6B45` | Forest green — approve, positive actions |
| `--chip` | `#EBDFC5` | Tag backgrounds, row hover |
| `--shadow` | see below | Card elevation |

**Card shadow:**
```css
box-shadow: 0 1px 0 rgba(30,20,10,0.04), 0 14px 30px -18px rgba(60,40,10,0.18);
```

### ACE Dark — used only on the ACE page

| Token | Hex | Usage |
|---|---|---|
| `--ace-bg` | `#0F0C08` | Page background |
| `--ace-panel` | `#181410` | Cards |
| `--ace-panelHi` | `#211B14` | Elevated card bg, stat cells |
| `--ace-border` | `#2C2318` | Borders |
| `--ace-ink` | `#F0E6CF` | Primary text |
| `--ace-sub` | `#7A6A52` | Secondary text |
| `--ace-amber` | `#E8A24A` | Primary accent — run button, inner ring |
| `--ace-middle` | `#C87B3C` | Middle ring color |
| `--ace-green` | `#6FAE7F` | Outer ring, completed status |
| `--ace-red` | `#C0442A` | Error status |
| `--ace-blue` | `#6A9ECA` | Info log entries |

### Typography

| Role | Font | Size | Weight | Notes |
|---|---|---|---|---|
| Page titles | Instrument Serif | 42–52px | 400 | `font-style: italic`, `letter-spacing: -0.5px` |
| Section headings | Instrument Serif | 20–24px | 400 | Italic |
| Pipeline numbers | Instrument Serif | 44px | 400 | Italic |
| Body / nav | Geist | 13–15px | 400–500 | |
| Labels / metadata / mono fields | JetBrains Mono | 9–12px | 400 | `letter-spacing: 1.5–2px; text-transform: uppercase` |

**Google Fonts:**
```html
<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Geist:wght@300..700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
```

### Spacing & Radius

- Base unit: 4px
- Common padding values: 9 12 14 16 18 20 22 24 28 32 36 44 48
- Card border-radius: `14px` (standard), `16px` (larger panels), `10px` (inner cards)
- Button radius: `999px` (pill), `8–10px` (rectangular)
- Tag radius: `3px` (square chip), `999px` (pill)

---

## Shared Components

### `<Card>`
```css
background: var(--panel);
border: 1px solid var(--line);
border-radius: 14px;
padding: 20px 22px;
box-shadow: 0 1px 0 rgba(30,20,10,0.04), 0 14px 30px -18px rgba(60,40,10,0.18);
```

### `<Btn variant="primary">`
```css
background: #C8571E; color: #FBF7EE;
border: none; border-radius: 999px;
font-family: Geist; font-size: 13px; font-weight: 500;
padding: 8px 16px; cursor: pointer;
```
Variants: `primary` (orange), `secondary` (transparent + border), `positive` (green #3F6B45), `ink` (dark bg), `ghost` (text only)

### `<SectionLabel>`
```css
font-family: JetBrains Mono;
font-size: 10px; letter-spacing: 2px;
text-transform: uppercase; color: var(--sub);
margin-bottom: 10px;
```

### `<Input>` / `<Textarea>`
```css
padding: 10–12px 14px;
background: var(--bg); color: var(--ink);
border: 1px solid var(--line); border-radius: 8px;
font-size: 13px; outline: none;
```
Mono fields (JSON, URLs): `font-family: JetBrains Mono`

### `<Select>`
```css
padding: 9px 32px 9px 12px;
background: var(--bg) + custom caret SVG;
border: 1px solid var(--line); border-radius: 8px;
appearance: none;
```

### `<Tag>`
- Default: `background: var(--chip); color: var(--sub)`
- Orange: `background: #C8571E28; color: #C8571E`
- Green: `background: #3F6B4522; color: #3F6B45`
- 9px mono, `letter-spacing: 1.5px`, uppercase, `border-radius: 3px`, `padding: 3px 8px`

---

## Sidebar

- `width: 230px`, `background: var(--panel)`, `border-right: 1px solid var(--line)`
- Logo: 34×34px gradient square (`#C8571E → #3F6B45`), italic "C" in Instrument Serif
- Nav items: 7 standard + ACE special item
- Active state: `background: var(--chip); font-weight: 500`
- **ACE nav item**: `background: var(--ink); color: var(--bg)` when active, amber pulse dot indicator
- Badges: JetBrains Mono 11px, right-aligned, no background pill
- Footer: daily stats summary (3 lines), user avatar (30px circle, orange bg)

---

## Pages

---

### 1. Dashboard (`/dashboard`)

**Layout:**
- Greeting header (date + h1 + CTAs)
- Pipeline rail card (4 steps with arrows)
- 2-col grid: Ingest card (1.3fr) + Cornerstone nudge (1fr)
- Signals list card

**Greeting h1:** Instrument Serif 52px italic. Dynamic: time-of-day greeting + italic accent phrase in `--accent`.

**Pipeline rail:** `display: flex` with `flex: 1` cells and `→` dividers (40px). Active step (Leads) has `color: --accent` and an absolute "NEEDS YOU" badge (mono 9px, orange bg, `top: -6px right: 16px`).

**Ingest card:** URL input + "Ingest feed" button. During ingest: button label shows `Ingesting… {n}`, a 2px absolute progress bar animates across the button bottom (`width = count/total * 100%`). Recent feed pill row below.

**Cornerstone nudge:** Subtle orange gradient tint (`linear-gradient(160deg, #C8571E12, transparent)`). Instrument Serif 24px body, italic key phrase in `--accent`. Two pill buttons.

**Signals list:** Topic filter pills + rows. Row grid: `28px 1fr auto auto 80px`. Hover → `background: var(--chip)`. "→ Lead" button fades in on hover (`opacity: 0 → 1, transition: 100ms`).

---

### 2. Signals (`/signals`)

**Sections (top to bottom):**
1. Pipeline breadcrumb card — mono 11px, clickable steps, staleness tag on right
2. RSS Feed Ingest card — URL input + animated ingest button
3. Manual Topic Injection card — collapsed by default, `+/-` toggle reveals input row
4. Latest signals card — filter pills + signal rows

**Signal row grid:** `28px 1fr auto auto 90px`
- ID: mono 10px, zero-padded, right-aligned
- Title + source/date
- Topic tag
- Heat bar (48×4px, fill = `--accent`)
- "↗ Lead" button (green, hover-only)

**Staleness tag:** orange tag "Stale · last ingest 9d ago" → replaced with green "+27 ingested" after ingest completes.

---

### 3. Leads (`/leads`)

**Sections:**
1. Status banner (conditional — shows when ≥2 leads pending, subtle green-tinted bg)
2. Lead Generation card — brand `<Select>` + "Generate leads" + "Get promo" buttons
3. Tabbed content — Pending Review / Approved / Drafted

**Tab styling:**
- Active: `border-bottom: 2px solid var(--accent); font-weight: 500`
- Count badge on active: orange bg, white text; on inactive: chip bg, sub text

**Lead card row grid:** `auto 1fr auto`
- ID chip: `background: #C8571E18; color: #C8571E; border-radius: 4px`
- Title (15px 500) + angle in italic Instrument Serif + signals count + age + due date
- Actions: Approve (green) / Pass (secondary) for pending; "→ Draft" (ink) for approved

**Generate button:** Shows spinner + "Generating…" during 1.8s loading state.

**Empty states:** Centered Instrument Serif italic heading + 13px body.

---

### 4. Issues (`/issues`)

**Sections:**
1. Generation card — brand/type/outline selects + "Generate issue draft" button + History button + outline management links
2. Editorial Steering — collapsed by default, expand reveals: persona preset pills + aggression range slider + 4 selects (audience/focus/tone/max leads)
3. Phase 2 Content Products — collapsed accordion, reveals 2×2 grid of product cards
4. Draft Preview — textarea with Regenerate/Copy/Export toolbar

**Collapsible sections:** Chevron icon rotates 180° on open (`transform: rotate(180deg); transition: 200ms`). Content fades in.

**Persona presets:** Pill buttons: "CISO Aggressive", "Board Brief", "Practitioner Tactical", "Reflective Operator". Active: `background: var(--ink); color: var(--bg)`.

**Aggression slider:** `<input type="range" min=1 max=5>` with `accent-color: var(--accent)`.

**Draft preview loading overlay:** `position: absolute; inset: 0; background: panelCC; border-radius: 10px` with centered spinner + italic serif label.

**Generation selects:**
- Brand: "Identity Jedi Newsletter" etc.
- Type: "full issue" / "insider access" / "quick brief"
- Outline: "Default newsletter issue ★" / "Default Insider Access" / "Special Edition"

---

### 5. Outlines (`/outlines`)

**Layout:** Two-column `280px 1fr`

**Library panel (left):**
- Header row: "LIBRARY" label + "+ New outline" button
- List items: padding `12px 18px`, active = `background: var(--chip); border-left: 3px solid var(--accent)`
- Each item: name (14px) + type (mono 9px uppercase, sub color)
- Footer: "Show disabled" checkbox

**Detail panel (right):**
- Header: outline name in Instrument Serif italic 22px + type/section count in mono + Save/Disable buttons
- Section cards: `border: 1px solid var(--line); border-radius: 10px`
  - Click to expand → edit mode (`border-color: var(--accent)`)
  - Header row: numbered circle badge + title + "edit/collapse" label
  - Collapsed: shows first 120 chars of prompt in sub color
  - Expanded: full `<Textarea>` for editing

**Empty state (no selection):** Centered `▤` icon + italic serif message.

**Section structure (mock):**
- Default newsletter: 6 sections (Opening hook, Market map, Core argument, Case study, What to watch, Takeaway)
- Default Insider Access: 4 sections
- Special Edition: 3 sections

---

### 6. Brand (`/brand`)

**Sections:**
1. Profile selector card — `<Select>` (full width) + "+ New" + "Save" + "Set as workspace default" buttons
2. Name + Profile Version — 2-col grid
3. ElevenLabs Voice ID + Model ID — 2-col grid
4. Voice Rules — `<Textarea>` mono, JSON object
5. Formatting Rules — `<Textarea>` mono, JSON object
6. Forbidden Patterns — `<Textarea>` mono, JSON array
7. Footer actions: Save / Duplicate / Delete (destructive, red text, right-aligned)

**JSON textarea labels:** Right-aligned "JSON object" / "JSON array" in mono 9px next to each SectionLabel.

**"Set as workspace default" button:** Toggles between secondary (unfilled star) and positive green state (filled star).

**Save confirmation:** Button text changes to "✓ Saved" for 2s then reverts.

**Profile data shape:**
```json
{
  "name": "Identity Jedi Newsletter",
  "version": "1.0",
  "elevenlabs_voice_id": "",
  "elevenlabs_model_id": "eleven_turbo_v2_5",
  "voice_rules": { "tone": ["direct", "confident", "human", "practical"], "avoid": [...], "reading_level": "practitioner" },
  "formatting_rules": { "promo_format": { "cta_style": "short and direct", "max_lines": 5 } },
  "forbidden_patterns": ["game-changer", "paradigm shift", "leverage", "unlock", "delve", "in conclusion"]
}
```

---

### 7. Research (`/research`)

**Sections:**
1. Agent Pipeline — 3 clickable action cards
2. Manual Ingest Controls — 3 secondary buttons
3. 2-col grid: Directives list (left) + Recent Runs (right)

**Pipeline action cards:** `display: grid; grid-template-columns: repeat(3, 1fr)`. Each card: title (14px 500) + sub description (12px sub). Click triggers a live console stream below the cards.

**Console stream:** `background: var(--bg); border: 1px solid var(--line); border-radius: 8px; font-family: mono`. Each line: `‹ {text}` — last line highlighted in `--ink`, earlier lines in `--sub`.

Running indicator inside card: spinner + "running…" in orange mono.

**Directive cards:** Stacked, `border-bottom: 1px solid var(--line)`. Each: freq tag (DAILY orange / WEEKLY default) + source count + last run date + topic description.

**Recent runs:** Each entry: status dot (green/red/amber) + status label + timestamp right-aligned + result text below.

**Pipeline actions:**
| Label | Description |
|---|---|
| Research + write leads | Run all daily directives and generate leads from findings |
| Generate newsletter draft | Run editor agent on approved leads → issue draft |
| Run full pipeline | Research → leads → draft in one pass |

---

### 8. ACE — Autonomous Content Engine (`/ace`)

**Visual identity:** Full dark theme (see ACE Dark tokens above). The sidebar remains Studio-light; only the main content area switches to dark.

**Implementation note:** When ACE is the active page, set `main { background: #0F0C08 }` and wrap the page content in `position: absolute; inset: 0; overflow-y: auto` so it fills the content area fully.

**Layout:**
```
┌──────────────────────────────────────────────────┐
│ Header: title + status chip (top-right)           │
├───────────────────────┬──────────────────────────┤
│ Ring Balance chart    │ Controls + Lane list      │
│ (SVG, ~380px)         │ (flex col, 2 cards)       │
├───────────────────────┴──────────────────────────┤
│ Activity timeline     │ Approval queue            │
└───────────────────────┴──────────────────────────┘
```

**Ring Balance SVG:**
- ViewBox: `0 0 380 380`, center `190 190`
- Three concentric rings: inner `r=62 sw=30`, middle `r=104 sw=26`, outer `r=144 sw=22`
- Colors: inner = `#E8A24A` (amber), middle = `#C87B3C`, outer = `#6FAE7F` (green)
- Background track: dim color (`#2C2318` / `#2A1E10` / `#1A2820`)
- Fill arc: `stroke-dasharray: "{pct * circ} {circ}"; stroke-dashoffset: circ * 0.25` (start at 12 o'clock); `stroke-linecap: round`
- Glow filter: `feGaussianBlur stdDeviation=3`, merged with source
- Hover: `filter: url(#aceGlow)` (stdDeviation=6) + dim opacity on other rings
- Center: 38px circle, `background: var(--ace-panel)` + `{pct}%` in amber mono 20px bold + status text in sub 8px
- Legend below: 3 items (inner/middle/outer), colored dot + tier name + fill %
- Hover on legend/ring → tooltip card showing lane breakdown for that tier

**Status chip (top-right):**
- Panel card, `border-radius: 16px`, border glows amber when enabled
- Pulse dot: `animation: pulse 1s ease-in-out infinite` when running
- `ACE_ENABLED` inline toggle switch
- States: STANDBY (grey) / LIVE (green) / running label (amber)

**Run panel:**
- Single "▶ Run ACE" primary button — amber bg when enabled, inactive when disabled
- "Force" secondary button (bypass guards)
- Progress shimmer on card top border while running: `linear-gradient(90deg, transparent, #E8A24A, transparent)` with `background-size: 200%` + slide animation
- Quick stats: 3-cell grid `[last run] [total drafts] [health %]` — each cell in `--ace-panelHi`

**Lane list:**
- Each lane: name + ring tier tag + `{current}/{target}` right-aligned
- 4px fill bar: `transition: width 1.4s cubic-bezier(0.4,0,0.2,1)` on run
- Animates when run completes

**Activity log:**
- Vertical timeline: absolute 1px line on left (`left: 6px`)
- Each entry: 13px glowing dot (color by kind) + kind label + timestamp + message
- Dot colors: ok=green, error=red, warn=amber, info=blue
- Dot has `box-shadow: 0 0 6px {color}88`

**Lane data:**
| Name | Ring | Target |
|---|---|---|
| IAM Core | inner | 8 |
| AI × Identity | middle | 4 |
| Enterprise Program Building | middle | 2 |
| Practitioner to Leader | middle | 2 |
| B2B Creator | outer | 2 |

**Run behavior:**
- If ACE_ENABLED=false AND not force: log "Stale guard tripped / not enabled", stage = "skipped"
- If enabled OR force: stream 5 log entries at 700ms intervals, animate lanes on completion

---

## Interactions Summary

| Page | Interaction | Behavior |
|---|---|---|
| Dashboard / Signals | Ingest feed | Button → "Ingesting… N" + progress bar on button bottom |
| Signals | Promote signal | Hover row → green "↗ Lead" button fades in; click → toast + row removed |
| Signals | Topic filter | Pills filter list client-side, instant |
| Leads | Generate leads | 1.8s spinner → toast |
| Leads | Approve / Pass | Row removed from pending, added to approved (or removed) |
| Issues | Editorial Steering | Collapsed card, chevron rotates on expand |
| Issues | Generate draft | Loading overlay on textarea with spinner |
| Outlines | Select outline | Left-border indicator + detail loads in right panel |
| Outlines | Edit section | Click section → border turns orange, textarea revealed |
| Brand | Save | Button text → "✓ Saved" for 2s |
| Research | Pipeline action | Click card → streaming console appears below |
| ACE | Run ACE | Progress shimmer + log stream + ring animation on complete |
| ACE | Ring hover | Tooltip with tier lane breakdown |
| ACE | ACE_ENABLED toggle | Status chip updates, run button activates |

---

## Navigation & Routing

- 8 routes: `/dashboard` `/signals` `/leads` `/issues` `/outlines` `/brand` `/research` `/ace`
- Active page persists to `localStorage` key `cs_page`
- Sidebar `<Link>` active state: `background: var(--chip); font-weight: 500`
- ACE sidebar item: special style — `background: var(--ink); color: var(--bg)` when active + amber pulse dot
- Issues badge: live count from API

---

## Files in This Package

| File | Description |
|---|---|
| `README.md` | This document |
| `Cornerstone OS.html` | Full interactive prototype — open in browser |
| `cornerstone/Theme.jsx` | Shared tokens + primitive components (Btn, Card, Input, Select, Textarea, Tag) |
| `cornerstone/SharedLayout.jsx` | Sidebar + PageShell components |
| `cornerstone/PageSignals.jsx` | Signals page |
| `cornerstone/PageLeads.jsx` | Leads page |
| `cornerstone/PageIssues.jsx` | Issues page |
| `cornerstone/PageOutlines.jsx` | Outlines page |
| `cornerstone/PageBrand.jsx` | Brand profiles page |
| `cornerstone/PageResearch.jsx` | Research console page |
| `cornerstone/PageACE.jsx` | ACE page (dark treatment + ring chart) |
| `components/SharedData.jsx` | Mock data (signals, leads, issues, pipeline stats) |

> **Note:** `Cornerstone OS.html` requires an internet connection to load fonts and React from CDN.

---

## Implementation Notes for Claude Code / Cursor

- Replace all `React.useState` with your real data-fetching layer (React Query / SWR / tRPC)
- All `<Select>` options should be populated from API — brand profiles, outline names, etc.
- The pipeline rail counts (`Research 200 / Leads 12 / Issues 3 / Outlines 8`) come from a `/api/dashboard/stats` summary endpoint
- The greeting headline is dynamic: time-of-day + backend-computed motivational line based on pending actions
- ACE `ACE_ENABLED` toggle should write to your feature flag store / env config
- The ring chart lane `current` values come from your content analytics — count of published items per lane in the last 30 days
- Telegram approval queue is real-time — use websockets or polling
- The `heat` score on signals is a backend-computed field on the Signal model (0–100)
- All toast notifications should use your existing notification system if one exists
- The `font-family` fallback chain is: `'Geist', system-ui, -apple-system, sans-serif` — if Geist is already in your codebase via a package, use that instead of the Google Fonts CDN import
