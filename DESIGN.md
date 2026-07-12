ESIGN.md
⤢ Fullscreen
Share ▾
✕


›
# Wikimedia Codex

> Category: Reference / institutional
> The design system behind Wikipedia, MediaWiki, and the Wikimedia
> Foundation product surfaces. Print-influenced restraint, dense
> reading layouts, hairline borders, and one progressive blue as the
> only brand signal.
>
> Source of truth: <https://doc.wikimedia.org/codex/latest/>
> All hex values, token names, and component anatomy below are
> reconciled against design-tokens/ and components/ on that site.

## When to use it

Pick Codex when the brief is **reference, civic, scholarly, or
content-first**: encyclopaedic articles, library catalogues, GLAM
tools, dataset browsers, citation viewers, internal MediaWiki-adjacent
tools, anything that needs to feel kin to Wikipedia without copying it
pixel-for-pixel. Avoid it for marketing pages, consumer apps, or
brands that need warmth — Codex is deliberately cool, dense, and
sober.

## Visual Theme & Atmosphere

Print-influenced restraint. The system reads like a well-set
reference book: generous reading column, small radii (0–2px),
hairline rules instead of cards, no decorative shadow, no gradients,
no illustrative chrome. Density is a feature — Codex pages routinely
show four-level navigation, dense tables, and inline metadata without
padding them out.

The single brand signal is the progressive blue #36c. Use it on
links, primary buttons, and focus. Anywhere else you reach for colour,
the answer is usually "don't" — fall back to weight, rule, or
whitespace.

## Color Palette & Roles

All values below are the canonical Codex tokens from
doc.wikimedia.org/codex/latest/design-tokens/color.html.

| Role | Hex | Codex token | Purpose |
| --- | --- | --- | --- |
| Page (--bg) | #F8F9FA | background-color-neutral-subtle | Never pure white. |
| Surface (--surface) | #FFFFFF | background-color-base | Cards, modals, the article column. |
| Foreground (--fg) | #202122 | color-base | Body text. |
| Emphasized (--fg-2) | #101418 | color-emphasized | Article H1, lead paragraph. |
| Muted (--muted) | #54595D | color-subtle | Subtext, captions. |
| Meta (--meta) | #72777D | color-placeholder | Placeholder, file metadata. |
| Border (--border) | #A2A9B1 | border-color-base | Primary edge — toolbars, cards. |
| Border subtle | #C8CCD1 | border-color-subtle | Secondary edges, table outlines. |
| Border soft (--border-soft) | #EAECF0 | — | Inner row separators. |
| Accent (--accent) | #3366CC | color-progressive | Progressive blue — links, primary CTAs. |
| Accent hover | #3056A9 | color-progressive--hover | Hover state — darker, not lighter. |
| Accent active | #233566 | color-progressive--active | Active / depressed state. |
| Visited | #6B4BA1 | color-visited | Visited links only. |
| Success | #177860 | color-success | State, ≤5% of surface. |
| Warn | #886425 | color-warning | Warning text & icons. |
| Danger | #BF3C2C | color-destructive | Destructive actions only. |

State background tints (for Message component and inline highlights):

| Role | Hex | Codex token |
| --- | --- | --- |
| Progressive subtle | #F1F4FA | background-color-progressive-subtle |
| Warning subtle | #FDF2D5 | background-color-warning-subtle |
| Destructive subtle | #FFE9E5 | background-color-destructive-subtle |
| Success subtle | #DFF1E6 | background-color-success-subtle |

Never invent secondary brand colours. If a panel needs separation,
reach for --bg-base--hover (#F8F9FA) or a hairline --border-soft
rule before reaching for tint.

## Typography Rules

- Chrome / UI: system sans
  -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Inter", "Helvetica Neue", Helvetica, Arial, sans-serif
  (--font-display, --font-body, also exposed as --font-system /
  --font-system-sans).
- Article body & headings: serif
  "Linux Libertine", "Georgia", "Times", "Source Serif 4", serif
  (--font-serif / --font-heading-main). Only opt in for prose
  body and article-level H1/H2 — never for UI labels.
- Mono: "Menlo", Consolas, "Liberation Mono", "Fira Code", "Courier New", monospace
  for code, identifiers, and tabular numerics.
- Scale (canonical Codex, rem-based): font-size-x-small
  (0.75rem / 12px), -small (0.875rem / 14px — body default),
  -medium (1rem / 16px), -large (1.125rem / 18px), -x-large
  (1.25rem / 20px), -xx-large (1.5rem / 24px), -xxx-large
  (1.75rem / 28px). The schema-slot --text-* mirrors this scale and
  adds --text-3xl 32px / --text-4xl 48px for display work.
- Body rendering target is 14px, not 16px — Codex/Vector skin
  applies 0.875rem at the body so Wikipedia reads denser than
  generic modern minimal. Don't bump it back to 16.
- Weights: font-weight-normal 400, -semi-bold 600, -bold 700.
  Use 700 for article H1, 600 for sub-headings, 400 everywhere else.
- Leading: 1.5715 for body, 1.25 for headings.
- Tracking: -0.005em on display sizes. Do not tighten further.

## Component Stylings

Anchored on doc.wikimedia.org/codex/latest/components/.

- Buttons. Three weights × three actions:
  - Weights: normal (1px border, transparent fill), primary (filled
    --accent), quiet (no border, no fill, text colour only).
  - Actions: default (neutral grey), progressive (--accent),
    destructive (--danger).
  - Sizes: small 24px min-height, medium 32px (default),
    large 44px. All radius --radius-sm (2px). Padding-block 6px,
    padding-inline 12px at medium.
- Inputs. 1px --border outline, 2px radius, 6/8px padding.
  Focus uses the Codex two-stroke inset
  inset 0 0 0 1px #fff, inset 0 0 0 2px var(--accent) — a white
  halo inside a 2px progressive band. Do not swap in an outset glow.
- Cards. White surface, 1px --border or --border-subtle edge,
  2px radius (--radius-sm), 16–24px interior padding. No drop
  shadow by default — Codex cards are flat. Reach for --shadow-card
  (=box-shadow-small, a 1px ring) only when the card sits on a
  competing surface.
- Tabs. Underline-the-active-tab, no pill backgrounds. Active tab
  carries a 2px --accent bottom border; inactive tabs are plain.
  Quiet variant is the default; framed variant adds a 1px container.
- Menus / popovers. White surface, 2px radius, the canonical
  --shadow-menu token
  (0 4px 4px 0 rgba(0,0,0,.06), 0 0 8px 0 rgba(0,0,0,.06) —
  Codex's box-shadow-medium). 1px --border-subtle edge.
- Message. Four types: notice / warning / error / success. Block
  variant uses the matching background-color-*-subtle token + 1px
  border-color-* edge + an icon in the matching color. Inline
  variant strips padding, background, and border — icon and text
  only. Never use ad-hoc tints; the four subtle backgrounds above are
  the entire vocabulary.
- Badges / pills (`InfoChip`). --radius-pill, 12px font.
  Reserve filled pills for state (--bg-warning-subtle,
  --bg-progressive-subtle); outlined pills for non-state metadata.
- Links. --accent colour, no underline by default, underline on
  hover. Visited links shift to --color-visited (#6B4BA1) —
  never disable this; the visited contract is part of Wikipedia
  navigation literacy.

## Layout Principles

- 12-column grid, 1200px max-width, 24px desktop gutters / 16 tablet /
  12 phone.
- Reading column for prose: cap at ~720px wide — Wikipedia's article
  text comfortably reads at this width and so should yours.
- Section rhythm: 64px desktop, 40px tablet, 24px phone (Codex is
  tighter than modern minimal: 80/48/32).
- Use whitespace and hairline rules as separators. Cards-on-a-page
  pattern is not Codex — prefer rule-separated blocks inside one
  surface.

## Spacing scale

Canonical Codex spacing-* tokens are exposed as --sp-* aliases:

| Token | px | Token | px |
| --- | --- | --- | --- |
| --sp-0 | 0 | --sp-75 | 12 |
| --sp-6 | 1 | --sp-100 | 16 |
| --sp-12 | 2 | --sp-125 | 20 |
| --sp-25 | 4 | --sp-150 | 24 |
| --sp-30 | 5 | --sp-200 | 32 |
| --sp-35 | 6 | --sp-250 | 40 |
| --sp-50 | 8 | --sp-300 | 48 |
| --sp-65 | 10 | --sp-400 | 64 |

(The schema-slot --space-N ladder — 4/8/12/16/20/24/32/48 — is the
subset most agents should reach for first; the granular --sp-* set
is there when component-specific spec demands it.)

## Depth & Elevation

Three levels, each backed by a canonical Codex box-shadow-* token:

- Flat (`--elev-flat: none`) — default for every container.
- Ring (`--elev-ring`) = box-shadow-small
  (0 0 0 1px #a2a9b1). A hairline ring, used as the "edge" on
  borderless surfaces (tab strips, sidebars).
- Raised (`--elev-raised`) = box-shadow-medium
  (0 4px 4px 0 rgba(0,0,0,.06), 0 0 8px 0 rgba(0,0,0,.06)). Used
  for menus, dropdowns, popovers. Cards do NOT get this by default.
- Heavy (`--shadow-drop-xx-large`) = 0 20px 48px 0 rgba(0,0,0,.2).
  Reserved for toasts and the rare floating panel that needs to
  dominate.

No neumorphism. No glassmorphism. No coloured shadows. No gradients.

## Focus state

Codex's standard focus is the two-stroke inset:

```css
:focus-visible {
  box-shadow: var(--focus-ring); / inset 0 0 0 1px #fff, inset 0 0 0 2px var(--accent) /
  outline: var(--outline-base--focus); / 1px solid transparent — Windows high-contrast hook /
}
```

For native outline fallbacks on generic elements, use
outline: 2px solid var(--outline-color-progressive--focus). Do not
add an outset drop shadow as a focus indicator; it competes with the
hairline border system.

## Do's and Don'ts

- ✅ Hairline --border-soft rules between rows; reserve --border
  for the surface edge itself.
- ✅ One accent element per screen — the primary CTA, OR the active
  tab, OR a single hero link. Not all three.
- ✅ Sentence-case headings. Title-case is for proper nouns only
  (project names, place names).
- ✅ Real metadata in the article header — ISO date, author byline,
  source attribution. Codex pages are honest about provenance.
- ❌ No rounded cards with a coloured left border accent — that's an
  AI-slop tell and not a Codex pattern.
- ❌ No emoji icons in chrome. If an icon is needed, use a Codex
  glyph (or a flat 16px SVG that follows the same line weight).
- ❌ No gradient backgrounds, including subtle ones.
- ❌ No more than three type sizes on one screen of UI chrome (article
  body type is a separate budget).
- ❌ Don't invert the progressive hover/active states. Codex hover is
  darker (#3056A9), not the lighter blue some Wikimedia
  derivatives use.

## Responsive Behavior

- Desktop ≥ 1024px: 12-col grid, 720px article column, persistent
  left-rail navigation.
- Tablet 640–1023px: 8-col grid, navigation collapses to a top
  menu, article column expands to fill.
- Phone < 640px: Single column, 12px gutters, navigation behind a
  hamburger. Hero/banner blocks drop to ~40vh.

## Agent Prompt Guide

- When in doubt, subtract. Fewer boxes, less chrome, more rules
  and whitespace.
- The accent is precious. If a screen has three blue things, two of
  them are wrong — convert one to a quiet button and one to plain
  body text.
- Do not import this system to "look like Wikipedia" — import it to
  inherit Wikipedia's restraint. Originality lives in the content
  and the information design, not in the chrome.
- Article-body type and article-level H1/H2 use the serif stack
  (--font-serif / --font-heading-main). UI chrome uses the
  system sans (--font-display / --font-body). Mixing them inside
  the same heading reads as broken.
- For dense tables: hairline --border-soft rules, no row striping,
  tabular numerics (font-variant-numeric: tabular-nums), mono for
  IDs and hashes. This is where Codex out-performs modern minimal —
  lean into it.
- Component class names (cdx-button, cdx-text-input,
  cdx-tabs, cdx-card, cdx-message, cdx-info-chip) are stable
  and document-able — use them when handing off to engineers who'll
  port the markup into a Codex/Vue product