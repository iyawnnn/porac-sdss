# PORAC-SDSS Visual System

The approved visual direction for PORAC-SDSS: a Cloudflare-inspired municipal operations
interface built on the existing Tailwind v4 + shadcn/Radix foundation.

## Status and authority

**This document defines the target visual system. It is not yet implemented.** No
application code has been changed to match it.

| Document | Role |
|---|---|
| **`docs/design-system.md`** (this file) | The approved visual direction: palette, typography, surfaces, spacing, component styling rules, anti-patterns, implementation order. |
| `DESIGN.md` (root) | **Superseded in intent, not yet reconciled.** Its v3 spec (navy sidebar, Porac Yellow, `[data-shell="admin"]` override) was never implemented, and its own header concedes it is "not the currently shipped authoritative UI." Reconciling or retiring it is a separate, explicitly deferred task. Until then, where the two disagree, this file describes the intended direction and `DESIGN.md` describes history. |
| `PRODUCT.md` (root) | Still authoritative for product, audience, and brand *personality*. Its brand *color* statement (institutional blue) and its "warm cream/sand" anti-reference are superseded by this file; that edit is deferred. |
| `docs/project-status.md` | Remains the only roadmap and status authority. §7 below is a design sequencing note, **not** a product roadmap, and does not queue features. |

Nothing in this document changes ticket statuses, Hazard Urgency logic, Operational
Priority logic, routing, API contracts, auth, or any application behavior.

---

## 1. Why this system exists

Three visual systems are currently layered on top of each other in the app and none of them
won:

1. A hand-rolled PORAC token layer (`--color-canvas`, `--color-ink-*`, `--color-brand-*`,
   plus urgency/status/flag ramps) in `app/globals.css`'s `@theme` block.
2. Stock shadcn `radix-nova` tokens (`--background`, `--primary`, `--border`, …) in the
   same file's `:root`, never repointed at PORAC's brand.
3. Per-file inline hex and raw Tailwind palette classes in feature components that ignore
   both.

They actively conflict. `body` receives `background: var(--color-canvas)` unlayered and
`@apply bg-background` inside `@layer base`; unlayered CSS wins, so the page canvas comes
from one system while every shadcn primitive renders from the other. Most visibly,
`--primary` is still `oklch(0.205 0 0)`, so every default button in the app renders
**black**, not brand — the blue ramp reaches no primitive at all.

Downstream, the same meaning is defined up to six times (ticket status alone exists as
`--color-status-*`, `--color-lifecycle-*`, hardcoded hex in `StatusPill.tsx`, hardcoded hex
in `reportStatusStyle.ts`, and that map duplicated verbatim again in the citizen report
detail page). The clearest symptom of the drift: `priorityScoreBandClass` and
`getUrgencyBadgeConfig` derive from the *identical* `urgencyLevelFromScore` call — the
source comment states they are "always in lockstep" — yet render from different palettes,
so a `LOW` ticket shows a green score badge beside a yellow "Low" urgency badge.

**The goal of this system is one token layer, one type scale, and one set of component
rules.**

---

## 2. Design principles

1. **One meaning per color channel.** Urgency, status, and integrity flags are structurally
   independent systems that happen to render as color. They must never collide.
   *(Retained from `PRODUCT.md` — the strongest rule the existing system has.)*
2. **Brand orange is chrome, never data.** It may signal primary action, active navigation,
   selection, and focus. It may never appear on a badge, pill, status, urgency band, chart
   series, map marker, or KPI accent.
3. **The canvas recedes, the data advances.** Chrome is neutral. Saturated color is spent
   only on the one action the user should take and on genuine hazard signal.
4. **Borders, not shadows.** Elevation is a 1px border plus a one-step surface shift.
   Shadow is reserved for layers that genuinely float.
5. **Density matches the audience, not the brand.** Same tokens and components, different
   steps on the scale: admin compact (desk use, hours at a time), citizen generous
   (outdoors, one-handed, under stress).
6. **Every semantic color resolves to a token.** No raw Tailwind palette class for anything
   carrying meaning. The only permitted hex literals are Leaflet `divIcon` mirrors, which
   must be generated from the token source rather than maintained by hand.
7. **Redundant encoding for color-carried meaning.** Band and status names are always
   spelled out; map pins encode urgency by size and ring weight as well as hue.

---

## 3. Color

### 3.1 Light mode — approved

Values below are **proposed PORAC-SDSS tokens**, informed by Cloudflare's design qualities.
They are **not** Cloudflare's official palette and must not be described as such. Every
pair requires contrast verification during implementation.

**Neutrals — warm off-white canvas, charcoal text.** A warm-neutral (stone) ramp is used
rather than a cool slate: it pairs with orange without the muddy cast a cool grey produces,
and it is what gives the canvas its "ice / stone white" quality. Primary text is near-black
charcoal, never pure black.

| Token | Hex | Use |
|---|---|---|
| `bg` | `#FAFAF9` | Page canvas |
| `surface` | `#FFFFFF` | Cards, tables, panels |
| `surface-elevated` | `#FFFFFF` | Dropdown, popover, dialog, sheet, map popup (plus shadow) |
| `surface-muted` | `#F5F5F4` | Table headers/footers, inset wells, disabled fills |
| `border` | `#E7E5E4` | Hairlines, dividers, card edges |
| `border-strong` | `#D6D3D1` | Input edges, emphasis |
| `text-primary` | `#1C1917` | Body and headings |
| `text-secondary` | `#57534E` | Secondary text, table headers |
| `text-muted` | `#79716B` | Meta, timestamps, placeholders, captions |

**Brand — two steps, for contrast reasons.** A single orange cannot do both jobs:

These are the values **as shipped** in `app/globals.css` (`:root`, the 2026-08 brand
repoint against the PORAC-SDSS Brand Guidelines). An earlier revision of this table
documented a different, never-shipped ramp (`#F26B1D` / `#C2410C` / `#FEF3EA` / `#F9C99E`);
those hexes are gone — read `--brand*` in `globals.css` as the source of truth.

| Token | Hex | Contrast vs. white | Use |
|---|---|---|---|
| `--brand` | `#FF7A00` | 2.61:1 | The guidelines' orange. Focus ring (`--ring`), active-nav indicator, accent borders, and **decorative** (`aria-hidden`) accent icons. See the contrast caveat below. |
| `--brand-solid` | `#A85100` | **5.47:1** | `--primary` / `--sidebar-primary`. Filled primary buttons with white text, and any orange that carries text — passes AA |
| `--brand-hover` | `#854000` | — | Hover/active on filled controls |
| `--brand-subtle` | `#FFF4EB` | — | Active nav fill, selected row/toggle, active chip |
| `--brand-border` | `#FFD9AD` | — | Border on `--brand-subtle` fills |

`#FF7A00` **cannot** carry white button text at AA, which is why filled controls use the
deeper `#A85100` (same hue, 29°). This is an accessibility constraint, not a stylistic
preference, and it is why the primary button reads deeper than the guidelines' swatch.

**Contrast caveat on `--brand`.** At 2.61:1 it does not clear the 3:1 non-text floor in §8,
so it must never be the *only* signal identifying a control or its state. It is used for
focus rings (which always accompany a native focus change) and for `aria-hidden` icons that
sit beside a visible text label — decorative, and therefore outside WCAG 1.4.11. Anything
that carries meaning on its own takes `--brand-solid`.

There is no `brand-text` token. Links and text-on-white use `--primary` (= `--brand-solid`).

**Semantic states — kept distinct from brand.**

| Token | Hex | Subtle fill | Use |
|---|---|---|---|
| `success` | `#197A4B` | `#E8F6EE` | Healthy metrics, positive confirmation |
| `warning` | `#B25E09` | `#FDF3E3` | Caution, at-risk |
| `danger` | `#C4321F` | `#FDECEA` | Destructive actions, errors |
| `info` | `#2B6CB0` | `#EEF4FB` | Informational |

`info` deliberately reuses the retiring institutional blue `#2B6CB0`: it is already in the
codebase, already contrast-verified, and keeps a familiar hue in the system rather than
introducing a tenth.

**KPI deltas.** The dashboard KPI cards carry a week-over-week comparison
(`DeltaIndicator`, `DashboardClient.tsx`), colored by the arithmetic sign of the change:

| Token | Hex | Use |
|---|---|---|
| `--delta-up` | `#0F7A5A` (5.31:1) | Any increase |
| `--delta-down` | `#B42318` (6.57:1) | Any decrease |
| `--delta-flat` | `#6B7280` | No change |

**This was a deliberate reversal, recorded so it is not "corrected" back by mistake.** An
earlier revision colored these by *judgement* rather than sign — a rise in Active Tickets or
Pending Work Orders rendered `--delta-down` red, on the grounds that a growing hazard backlog
is bad news and that coloring it green repeats the failure mode behind `DESIGN.md` §4.4's
rejection of green-for-Low. It was changed to the conventional up-is-green reading on
request. The consequence is live and intended: a growing backlog reads green on those two
cards.

One deviation on record: `--delta-up`/`--delta-down` share a hue family with
`--color-status-resolved-*`/`--color-status-rejected-*`, against §2.1 (one meaning per color
channel). Accepted because they never share a form factor — a status is a tinted pill with a
dot, a delta is bold inline text always carrying a `+`/`−` and an arrow, so neither is
color-only. A *third* green wanting onto this dashboard should trigger a rethink rather than
being added to the pile.

### 3.2 Semantic data palettes — TBD

**These are not finalized and must not be changed without explicit approval.** They are
listed here so the open decisions are tracked, not to authorize an edit.

| Palette | Current state | Status |
|---|---|---|
| **Hazard Urgency** (`urgency_band` — Low / Medium / Critical) | Warm-only: amber `#D99A00` → orange `#E2680E` → red `#C42B1C` | **TBD.** A direction has been discussed — cooling **Low** to a neutral slate so no band shares a hue with brand orange, while keeping Medium yellow-amber and Critical solid red, and preserving the tint / tint / solid escalation asymmetry so Critical still wins the scan in a long queue. **Exact values are not approved and not implemented.** Any change must preserve `DESIGN.md` §4.4's standing rejection of green-for-Low (green reads as "fine," wrong for a queue where every row is an active hazard) and must be re-verified for deuteranopia/protanopia. |
| **Ticket status** (Reported / Under Review / In Progress / Resolved / Rejected) | Blue-progression + green Resolved + red Rejected, defined in four places | **TBD.** Consolidation onto tokens is required; the hues themselves are unresolved. The five status *names* are fixed and must never change. |
| **Operational Priority** (`priority_index`) | `emerald / amber / rose` | **TBD.** Must end up visually distinct from Hazard Urgency, since it is a genuinely different model — and the two must stop being the reverse of that today. |
| **Work-order status** | `slate / blue / emerald / red` | **TBD.** |
| **Moderation status** | `blue / orange / emerald / sky` | **TBD.** The `orange` entry will need review once brand orange lands. |
| **Integrity flags** | Violet `#7B2FA8` family | **Retained.** Correctly isolated from every other ramp; no change proposed. |
| **Map accents** (terrain / waterway / lahar / infra-safety) | `#5F7F63 / #3B82A0 / #9A6A3A / #D99A22` | **Retained.** Map-only, collides with nothing. `infra-safety` should be re-checked against brand orange when implemented. |
| **Chart series** (`lifecycle` / `severity` / `office`) | Token-driven, correct | **Retained.** These already read from tokens properly. Brand orange must never join them as a series color. |

### 3.3 Future dark mode — direction only, not implemented

Dark mode is **not** in scope and no dark theme ships today. The direction is recorded so
the token layer can be structured for it rather than refactored later.

- Charcoal / graphite canvas, **never pure `#000000`**.
- Layered dark-grey surfaces following the same three-step hierarchy as light mode.
- Off-white text, muted grey borders, orange brand accent lightened for dark surfaces
  (a bright orange that works on white is too dark on graphite, and vice versa).

Indicative direction: canvas `#191918`, surface `#212020`, elevated `#2A2827`, border
`#3A3735`, text `#FAFAF9` / `#A8A29E`, brand lightened toward `#F98C4B`.

**One caveat that makes this a real fix rather than a nice-to-have:** there is currently no
`.dark` block and no `@custom-variant dark` anywhere in the CSS, but Tailwind v4's default
`dark` variant is `prefers-color-scheme`, and the `radix-nova` primitives ship dozens of
`dark:` utilities. Those **already fire today** for any user whose OS is set to dark — against
light token values. `components/ui/chart.tsx` also emits a `.dark` block that can never
match. The app is therefore not "light-only" today; it is light-mode with scattered live
dark overrides and no palette behind them.

When dark mode is implemented, scope it to an explicit `[data-theme="dark"]` selector first
rather than `prefers-color-scheme`, so it ships deliberately instead of activating for OS-dark
users mid-phase.

---

## 4. Typography

### 4.1 Family — Inter is retained

**Inter is the right primary UI typeface for this project and should be kept.** It is
already loaded correctly via `next/font/google` with the real `opsz` axis (14–32) and
`font-optical-sizing: auto`, self-hosted at build time with size-adjusted fallback metrics —
so there is no layout shift and no new infrastructure to add. It offers excellent
small-size legibility, a wide weight range, and proper tabular figures for dense numeric
tables. Swapping families would cost a font load and buy nothing.

Two refinements worth making:

- Apply tabular figures (`tnum` / `tabular-nums`) wherever numbers align in columns — table
  cells, KPI values, scores, IDs. Partly done today; it should be a rule.
- Optionally enable Inter's `cv05`/`ss02` character variants to disambiguate `l` / `I` / `1`
  in ticket IDs and coordinates. Polish, not required.

**Geist Mono is retained** for machine-produced values: ticket IDs, coordinates, elevation,
timestamps, perceptual hashes. Human-authored text is never mono.

**Known defect to fix on implementation:** `--font-heading` currently aliases `--font-sans`,
so `font-heading` on `CardTitle`/`DialogTitle` is a no-op. Either drop the token or give it
real display-role defaults; carrying a no-op distinction invites drift.

No decorative typefaces are introduced.

### 4.2 Scale

Admin is the compact column, citizen the generous one. Weight and tracking are shared.

| Role | Admin (size / line-height) | Citizen (size / line-height) | Weight | Tracking | Family |
|---|---|---|---|---|---|
| Display / page title | 24 / 32 | 28 / 36 | 600 | −0.02em | Inter |
| Section heading | 16 / 24 | 18 / 26 | 600 | −0.01em | Inter |
| Card heading | 14 / 20 | 16 / 24 | 600 | −0.005em | Inter |
| Body | 14 / 20 | **16 / 24 (hard floor)** | 400 | 0 | Inter |
| Body emphasis | 14 / 20 | 16 / 24 | 500 | 0 | Inter |
| Label (form, KPI) | 12 / 16 | 14 / 20 | 500 | 0 | Inter |
| Micro-label (Queue KPI) | 11 / 16 | — | 600 | +0.08em, uppercase | Inter |
| Table header | 10 / 16 | — | 700 | +0.09em, uppercase | Inter |
| Table cell | 13 / 18 | — | 400, `tnum` | 0 | Inter |
| Caption / helper | 12 / 16 | 13 / 18 | 400 | 0 | Inter |
| Numeric KPI value | 28 / 32 | 24 / 30 | 600, `tnum` | −0.02em | Inter |
| Badge | 11 / 16 | 12 / 16 | 500 | +0.01em | Inter |
| Data (IDs, coordinates) | 12 / 16 | 13 / 18 | 400, `tnum` | 0 | **Geist Mono** |

**Uppercase is confined to table headers and Queue KPI micro-labels.** It is not used for
navigation, buttons, or section headings. This supersedes `DESIGN.md` v3's blanket "no
uppercase transform" rule: v3 was never implemented, the existing `TABLE_HEAD_CLASS`
already does this, and micro-caps table headers are a genuine part of the target register.

The Queue KPI micro-label is the single deliberate extension, added with the Precision
Queue rebuild (§5.8). Those five tiles sit directly above a table whose headers are
micro-caps; setting the tile labels in sentence case made the KPI row read as a separate
design from the table three rows below it. The extension is scoped to that one row — it is
not a licence to uppercase any label anywhere.

`TABLE_HEAD_CLASS` (`components/features/admin/shared/tableHead.ts`) is the single
definition of the table-header setting and is shared by the Dashboard and the Queue. It was
retuned from 11/600/+0.06em to 10/700/+0.09em with the Queue rebuild: the Queue's header
strip sits on `--color-surface-subtle` rather than white, and at the old setting the labels
competed with the 13px row text beneath them.

**The 16px citizen input floor is non-negotiable.** Below 16px, iOS Safari zooms the
viewport on input focus — disorienting for someone reporting a hazard outdoors, one-handed.
This is a correctness requirement, not a style preference.

All arbitrary pixel classes currently in use (`text-[28px]`, `text-[15px]`, `text-[11px]`,
`text-[10px]`) are replaced by this scale.

---

## 5. Layout foundations

### 5.1 Surface hierarchy

Exactly three steps, never four — a fourth nested elevation *is* the decorative-card
anti-pattern:

```
bg (page canvas)  →  surface (cards, tables, panels)  →  surface-elevated (floating layers)
```

`surface-muted` is a **lateral tint** for table headers, footers, and inset wells — not a
fourth elevation step.

### 5.2 Borders

Two weights only:

- `border` — hairlines, dividers, card edges.
- `border-strong` — input edges, emphasis, focus-adjacent.

### 5.3 Radii

Base `--radius: 0.5rem` (8px), tightened from today's 10px, with four meaningful steps.
Badges are explicitly `rounded-full` rather than inheriting a 26px `rounded-4xl`. Today the
same ticket-table row carries three unrelated radii (`Badge` 26px, `Card` 14px, `Button`
10px); that must not survive.

No `rounded-2xl` or larger on functional chrome.

### 5.4 Elevation

Three shadows, not the five currently in use:

| Level | Use |
|---|---|
| `xs` | Sticky headers only |
| `md` | Dropdown, popover, tooltip |
| `lg` | Dialog, sheet, map popup |

**Cards get no shadow.** They are defined by a 1px border against the canvas.

### 5.5 Spacing and density

4-point scale: `2, 4, 6, 8, 12, 16, 20, 24, 32, 40, 48, 64` — unchanged, it was already
correct.

One page-root gap per shell (admin `gap-4`), and **skeletons must match their page's grid
and gap**, since today several do not and hydration visibly jumps.

| | Admin | Citizen |
|---|---|---|
| Body text | 14px | 16px (floor) |
| Control height | 32px (`sm` 28px) | 44px minimum, 48px preferred |
| Table row | 36–40px | n/a |
| Touch target | pointer-optimised | **44×44px hard floor** |

### 5.6 Icons

Lucide, `strokeWidth: 1.75`. 16px inline with text, 18px sidebar, 20px standalone, 40px
only for large empty-state illustrations.

**No icon-in-a-colored-tile chips on KPI cards** — the number is the content.

### 5.7 Motion

120ms for color and opacity on hover/focus; 150ms for layered enter/exit. No entrance
animations, no scroll-triggered effects. `prefers-reduced-motion` is already respected
globally and must stay that way.

### 5.8 The two admin card treatments

There are **two** card treatments in the admin shell, and which one applies is decided by
the surface, not by taste. Do not mix them within one page.

**Dashboard treatment — gray frame.** `Card` with `bg-muted pt-2 pb-5` and a white
`CardBodyPanel` inset 5px left/right. The gray reads as a frame and the strip above the
panel is the header band. Used by `DashboardClient.tsx` and every card on `/admin`. Two
coupled invariants: the card's `pt-2` must equal the header's `pb-2` (that equality is what
centers the band), and the card's `pb-5` is paired to `CardBodyPanel`'s `mb-[-17px]`.

**Queue treatment — plain white card.** A single `rounded-xl border border-border bg-card`
container with no gray frame, introduced by the Precision Queue rebuild of `/admin/tickets`
and matching the Claude Design artboard "1a Precision queue". Used by the Queue's five KPI
tiles and by its one table card.

The Queue does not use the gray frame because its table card already stacks four bands that
each need their own fill — toolbar (`--card`), selection bar (`--brand-subtle`), header strip
(`--color-surface-subtle`), footer strip (`--color-surface-subtle`). A gray frame around
those reads as a fifth band and the card stops having a legible edge. `--color-surface-subtle`
(#fafafa) is the lateral tint §5.1 already allows for table headers, footers and inset wells;
it is not a fourth elevation step.

Both treatments are `rounded-xl` (11.2px at the 8px base) and carry no shadow (§5.4). The
Dashboard is deliberately **not** migrated to the Queue treatment — its cards are stat tiles
with a header band, and the frame is what separates label from value there.

Two more Queue-surface rules:

- **The table is a CSS grid, not `<table>`.** Ten columns at fixed px tracks cannot be
  expressed with table auto-layout, which re-derives widths from cell content. Tracks live
  in `components/features/admin/tickets/queue/columns.ts`, which is the single source for
  the header strip, the rows *and* `TicketQueueSkeleton` — that import is what now enforces
  the §5.5 skeleton-matches-grid rule instead of a hand-synced `COLUMN_COUNT`.
- **Wide tables scroll inside their own card, never on the page body.** The fixed tracks
  cannot compress, so below `queueMinWidth()` the flexible Ticket column would otherwise
  absorb the whole shortfall and collapse. The admin content column is ~960px at a 1280px
  viewport against the 1440px full-frame width the artboard was drawn at, so this is the
  common case, not an edge case. The toolbar's column-visibility menu is the real escape
  hatch: hiding columns lowers the floor.

---

## 6. Component rules

shadcn/Radix is **retained as the component foundation**. These primitives are restyled via
tokens, not replaced. `radix-nova` is well built; the work is repointing tokens and removing
a few overrides.

**Buttons** — `default` is a solid `brand-solid` fill with white text. `secondary` is
`surface` + `border-strong`. `ghost` is transparent with `surface-muted` on hover.
`destructive` is a solid `danger` fill for genuine destructive confirmation; the existing
tinted variant is retained as a subtle inline affordance. One radius. Remove the
`!important` on `!text-primary-foreground`.

**Inputs and selects** — `surface` fill, `border-strong` edge, 2px `brand` focus ring at 2px
offset. Admin 32px; citizen 48px with the 16px text floor. Error state uses a `danger`
border **plus a message**, never color alone.

**Cards** — `surface` fill, 1px `border`, no shadow. The current `ring-1 ring-foreground/10`
should become a real border so border tokens actually apply. Honor the built-in
`--card-spacing` instead of overriding padding per instance; add a `flush` variant for cards
whose content is a table or a map.

**Tables** — sticky header on `surface-muted`, uppercase micro-caps headers, 36–40px rows,
13px cells, `border` row dividers, **no zebra striping** (alternating fills compete with
urgency badges), `surface-muted` hover, `brand-subtle` selected row. Density belongs in the
primitive, not re-declared per workspace.

**Tabs** — the `line` variant is the default for in-page section switching: 2px `brand`
underline on active, `text-secondary` inactive.

**Badges** — the semantic home for urgency, status, flag, work-order, and moderation values.
Semantic variants driven by tokens; the generic variants are not used for data.
`rounded-full`, 20px tall, 11px text, **always paired with a text label**.

**Dropdowns, dialogs, tooltips** — `surface-elevated` + `border` + `shadow-md` (dropdown,
tooltip) or `shadow-lg` (dialog, sheet). Remove `backdrop-blur-xs` from the dialog overlay
and darken the scrim from `bg-black/10` so modals actually separate from the page. Tooltip
stays inverted.

**Navigation and sidebar** — `surface` sidebar on the `bg` canvas with a `border` edge.
Active item is a `brand-subtle` fill + `brand-text` label + 500 weight + `aria-current`.
A side stripe is never the sole active signal. Section headings are micro-caps in
`text-muted`. **The existing nav structure and labels are fixed** — the E2E suite asserts
them exactly.

**Breadcrumbs** — `text-muted` separators, `text-primary` current page, mono for the
ticket-ID segment.

**KPI / stat cards** — `surface`, 1px `border`, no shadow, no icon chip. Label (12px,
`text-secondary`) above value (28px, 600, `tnum`). Optional delta uses `success` / `danger`
text, never a fill. One shared component; there are currently five near-identical copies.

**Charts** — recharts is retained. Series colors continue to come from the existing
lifecycle / severity / office tokens, which are already correct. Axes and grid at `border`,
labels at `text-muted`, tooltip on the popover surface. **Brand orange is never a series
color.**

**Map panels, popups, controls** — flat `surface` + 1px `border` + `shadow-md`. **No glass.**
Controls keep their existing positioning and z-index. The heatmap gradient stays
deliberately off-palette.

**Empty states** — one shared component: 20px muted icon, 14px `text-primary` title, 13px
`text-muted` line, one optional action. There are currently eight variants across the two
shells.

**Loading states** — `Skeleton` on `surface-muted`, mirroring the real page's grid and gap.

**Errors** — `AdminErrorCard` is the healthiest existing pattern; retokenize it and give the
citizen shell the same component.

---

## 7. Anti-patterns

Explicitly banned:

- **Glassmorphism.** No `backdrop-blur` on cards, toolbars, or panels. Currently violated by
  the citizen map's `GLASS_PANEL` and the dialog overlay.
- **Gradients.** No gradient fills, gradient text, or gradient accents. Currently violated by
  the citizen login split-screen.
- **Orange as data.** No brand orange on any badge, status, urgency band, chart series, or
  map marker.
- **Decorative icon tiles.** No icon-in-a-colored-square pattern on stat tiles or nav items.
- **Excessive rounding.** No `rounded-2xl` or larger on functional chrome.
- **Zebra-striped tables.** Alternating fills compete with urgency badges.
- **Color-only meaning.** Every badge carries a text label.
- **Raw palette classes for semantic color.** No `bg-emerald-100` / `text-rose-700` style
  classes for anything meaningful; ~60 such uses exist today.
- **Duplicate color definitions.** One token, one definition. Leaflet hex mirrors are
  generated from the token source, never hand-maintained.
- **A fourth elevation level.** Three surfaces, no nested card-in-card-in-card.
- **Mixing the two card treatments on one page** (§5.8). A page is either gray-frame or
  plain-white throughout.
- **Page-level horizontal scroll.** A wide table scrolls inside its own container.
- **Shadows as default elevation.** Borders first.
- **Uppercase micro-copy outside table headers and Queue KPI micro-labels** (§4.2, §5.8).
- **Oversized headings in operational views.** A dashboard title never out-competes its data.

---

## 8. Accessibility requirements

- **WCAG AA** on every token pair: 4.5:1 for body text, 3:1 for large text and UI
  components. Every value in §3 must be verified with a contrast checker at implementation
  time, not assumed. `brand` `#F26B1D` specifically must not carry text.
- **16px citizen input floor** and **44×44px touch targets** — hard requirements. Currently
  violated by `LoginForm` and `SignupForm` (`h-9`, `text-sm`), which is a real bug to fix.
- **Visible focus on everything.** One global `:focus-visible` treatment driven by the
  focus-ring token; components should not hand-roll their own competing rings.
- **`aria-current` on active navigation.** The admin sidebar has it; the citizen header has
  no active state at all.
- **Redundant encoding.** Urgency and status are always spelled out; map pins encode urgency
  by size and ring weight in addition to hue.
- **`prefers-reduced-motion`** respected globally — already true, keep it.
- **Warm-hue collision risk.** Brand orange, urgency Medium, `warning`, and the map's
  `lahar` / `infra-safety` accents all sit in a warm neighborhood and degrade together under
  deuteranopia/protanopia. Keep map accents scoped to map layers so they are never adjacent
  to an urgency badge, and never rely on hue alone.

---

## 9. Implementation order

Design sequencing only. This is **not** a product roadmap and queues no features;
`docs/project-status.md` remains the sole roadmap authority.

| Phase | Scope |
|---|---|
| **0** | Light-mode token foundation + admin shell (sidebar, header). A visual proof of concept — deliberately minimal, semantic palettes untouched. |
| **1** | Shared primitives: semantic `Badge` variants, one `StatCard`, one `EmptyState`, `StatusPill` folded into `Badge`, the six duplicate color mappings collapsed onto tokens. Requires the §3.2 TBDs to be resolved first. |
| **2** | Ticket queue — table density into the primitive, filter bar, pagination. |
| **3** | Ticket detail — the six hand-rolled eyebrow cards onto `CardHeader`/`CardTitle`, priority breakdown, status tracker. |
| **4** | Dashboard — KPI row, chart card chrome, supporting panels. |
| **5** | Map surfaces — de-glass, control / legend / popup chrome. Highest Leaflet risk, so late. |
| **6** | Remaining admin workspaces — flagged, work orders, reports, activity log, admin management. |
| **7** | Citizen sweep — adopt the shared primitives, fix the auth accessibility floors, add mobile navigation, remove the gradient and glass panel. |
| **8** | Dark mode, if approved — token values only, behind an explicit `[data-theme]` selector. |

**Starting with phase 0 is deliberate.** The shell is the only surface every admin route
inherits, it is already structurally correct (shadcn `SidebarProvider` / `SidebarInset`,
`SidebarMenuButton isActive`) so it is a pure restyle, and the token repoint has the largest
effect per line changed. Restyling any feature page before the tokens exist means hardcoding
colors that must then be un-hardcoded.

Deferred structural work, tracked but explicitly not bundled with visual phases: the
duplicated desktop-table / mobile-card-list scaffold across four workspaces; the nested
`<main>` in the admin layout; `AdminHeader`'s `pageLabel()` route-coverage bug.

---

## 10. Implementation risks

- **No visual-regression tooling exists.** The E2E suite asserts text and roles, not pixels,
  so nothing will automatically catch a color or contrast mistake. Every phase needs manual
  QA at 360 / 768 / 1440px.
- **E2E selectors are structural in places.** The suite depends on the exact admin nav list,
  `aria-current`, real `<table>`/`<tbody>` markup, `data-slot` attributes and card counts,
  recharts internals, parent-traversal from `h1`, the citizen barangay **native `<select>`**
  (driven by `selectOption`), coordinate-based `.leaflet-container` clicks, and a large
  amount of exact visible copy. Restyle without changing markup, copy, or the native select.
- **One computed-style assertion exists** — `admin-shell.spec.ts` reads the sidebar's
  `backgroundColor` and asserts it is *not* `rgb(23,37,84)` (DESIGN.md v3's navy). A neutral
  sidebar passes.
- **Leaflet sizing is shell-coupled.** `main:has(> .admin-map-workspace)` is a full-bleed
  escape hatch and `MapSizeInvalidator` drives `invalidateSize` from a ResizeObserver. Any
  change to shell padding, `--app-header-height`, or `--app-wrapper-max-width` moves the map
  viewport.
- **Custom breakpoints are load-bearing.** `--breakpoint-dashboard: 75rem` and
  `--breakpoint-wide: 85rem` are used by the dashboard grid. Preserve them.
- **Chart tokens are consumed by name.** Renaming the lifecycle / severity / office tokens
  during consolidation breaks chart color config unless all consumers change together.
- **Global tokens have global reach.** A token change is not confined to the files edited;
  it will visibly affect surfaces that were not touched. Expect a mixed appearance between
  phases, particularly wherever `--color-brand-*` is consumed directly.
