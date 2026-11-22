# PORAC-SDSS Design System

The single authoritative visual-system document. It describes what the code does now
(`app/globals.css`, `app/layout.tsx`, `components/layouts/*`, `lib/theme.ts`, `public/brand/*`);
where a section names a gap, the gap is real. Built on Tailwind v4 + shadcn (`radix-nova`) + Radix.

## 1. Status and authority

| Document | Role |
|---|---|
| **`docs/design-system.md`** (this file) | The only design-system reference: brand, tokens, typography, logo, layout, component rules, anti-patterns, accessibility, design sequencing. |
| Figma file `PORAC-SDSS` (key `DTKTSGc97LWMQsZNvEPEBD`) | Approved brand source for colour, type and logo values. Figma wins over any earlier brief. |
| `DESIGN.md` (root) | Retired pointer. Its v3 navy/yellow spec was never shipped. |
| `PRODUCT.md` (root) | Product, audience, purpose and brand personality. |
| `docs/project-status.md` | The only roadmap. §10 below is design sequencing, not a product roadmap. |

Nothing here changes ticket statuses, Operational Priority logic, routing, API contracts, auth or
application behavior.

## 2. Principles

1. **One meaning per colour channel.** Ticket status, severity, office, integrity flags and
   feedback colours (danger / warning / info) are independent systems and must never collide.
2. **Brand colours are chrome, never data.** Porac Green and Sun Orange never appear as a status,
   severity, flag, chart series for data, or map marker. Orange is never a Low / Medium / High band:
   **Operational Priority is a numeric queue order with no bands** (Decision-Support Design p. 75).
3. **The canvas recedes, the data advances.** Chrome is neutral and green-tinted; saturated colour is
   spent on the one action to take and on genuine signal.
4. **Borders, not shadows.** Elevation is a 1px border plus a one-step surface shift. Shadow only on
   layers that float.
5. **Density matches the audience.** Same tokens, different steps: admin compact (desk), citizen
   generous (outdoors, one-handed, under stress).
6. **Every semantic colour resolves to a token.** No raw Tailwind palette class (`bg-red-100`,
   `text-slate-600`) for anything carrying meaning. Hex literals are allowed only in Leaflet
   `divIcon` mirrors.
7. **Redundant encoding.** Status and severity names are always spelled out; map pins encode by size
   and ring weight as well as hue.

## 3. Colour

All semantic tokens live in `app/globals.css`: `:root` (light) and `.dark` (dark). Tailwind v4 uses
`@custom-variant dark (&:is(.dark *))`, so `dark:` utilities follow the `.dark` class on `<html>`,
not the OS preference.

### 3.1 Brand palette

Exact Figma values:

| Name | Light | Dark |
|---|---|---|
| Porac Green / Leaf Green | `#0C4720` | `#3DAA6A` |
| Sun Orange / Sun Orange Dark | `#D05E32` | `#EE7444` |
| Ink / dark text | `#242425` | `#F2F6F3` |
| White / Night | `#FFFFFF` | `#0B1410` |
| Mist / Surface / Border | `#C2CEC6` / `#F1F5F3` / `#D9E2DC` | n/a |

Figma's token line also gives foreground `#14211A` and muted-foreground `#55635B`. Figma's own
contrast note: Sun Orange on white is 3.9:1, so it is for logo and large text only; use `#B8470F`
(5.3:1) for small orange text.

**Derived UI shades** (not in Figma; logo colours are unchanged):

| Token | Light | Dark | Why |
|---|---|---|---|
| `--input` | `#7E8F84` (3.4:1 on white) | `#6B8174` (4.2:1 on card) | Figma Border `#D9E2DC` is 1.3:1, so it is decorative only; control edges need 3:1. |
| `--card` / `--popover` | `#FFFFFF` | `#101C16` | Dark elevated surface. |
| `--muted-foreground` | `#55635B` | `#9DB0A4` | Secondary text. |
| `--brand-subtle` | `#E3EEE7` | `#14261C` | Active/selected/hover tint; also `--accent` and `--sidebar-accent`. |
| `--sun-ink` | `#B8470F` | `#EE7444` | Small orange text. |

Computed contrasts: Porac Green on white 10.8:1, Leaf on Night 6.4:1, muted-foreground on white 6.3:1,
dark foreground on Night 17.2:1, Sun Orange Dark on Night 6.4:1.

### 3.2 Semantic tokens

- **Primary** = `--brand-solid` (Porac Green light / Leaf dark); `--primary-foreground` is white /
  Night. `--ring` and `--sidebar-ring` = `--brand`. Related: `--brand-hover`, `--brand-wash` (row
  wash), `--brand-border`.
- **Orange is a secondary accent** via `--sun`, `--sun-ink`, `--sun-subtle`. Never a control fill,
  link or button colour (Figma: keep controls green), and never a priority band.
- **shadcn set**: `--background`, `--foreground`, `--card`, `--popover`, `--secondary`, `--muted`,
  `--accent`, `--border`, `--input`, `--destructive` (= `--color-danger`), `--chart-1..5`, `--sidebar*`.
- **Delta tokens** `--delta-up/-down/-flat`: KPI deltas coloured by arithmetic sign (a rise is green,
  a fall is red), a deliberate reversal of an earlier judgement-based scheme. A growing backlog
  therefore reads green on those cards; do not "correct" it back. They share a hue family with the
  resolved/rejected status tokens, accepted because a delta is bold text with a `+`/`-` glyph and
  arrow, never a tinted pill.
- **Dashboard trend chart** tokens (`--chart-bar*`, `--chart-grid`, `--chart-axis-text`,
  `--chart-reference`) are neutral by design.

### 3.3 Domain palettes (separate from brand)

Defined in the `@theme` block with dark overrides in `.dark`:

| Palette | Tokens |
|---|---|
| Feedback | `--color-danger`, `--color-warning`, `--color-info` (+ `-tint`, `-ink`, `-edge`) |
| Ticket status | `--color-status-{reported,under-review,in-progress,resolved,rejected}-{tint,ink,dot}`; the five names are fixed |
| Lifecycle (charts) | `--color-lifecycle-*` |
| Severity (charts) | `--color-severity-{critical,high,medium,low}`: the citizen's own severity, not Operational Priority |
| Office | `--color-office-meo`, `--color-office-mdrrmo` |
| Integrity flags | `--color-flag` family (violet), isolated from every other ramp |
| Map accents | `--color-terrain`, `-waterway`, `-lahar`, `-infra-safety`; **identical in both themes** (map data, not chrome) |

Work-order and moderation status palettes are still composed from these tokens and are not
separately finalised. Operational Priority renders as neutral numerics; heatmap intensity is
continuous.

### 3.4 Legacy token names

Kept and remapped to the green palette; theme-aware. New code should use the semantic tokens
(`primary`, `accent`, `ring`, `card`, `muted`).

- `--color-canvas` (`#F1F5F3` / `#0B1410`), `--color-surface`, `--color-surface-elevated`,
  `--color-surface-subtle` (queue header/footer bands), `--color-line-100/200`,
  `--color-ink-400/500/700/900`, `--color-meter-track`.
- `--color-brand-50..900`: a green ramp that **inverts in dark** (50 becomes the darkest tint).
  Legacy; prefer `bg-primary`, `text-primary`, `bg-accent`, `ring-ring`.

Migration state: the former `bg-brand-500` / `hover:bg-brand-600` / `text-brand-*` / focus-ring
utilities were moved to `bg-primary`, `text-primary-foreground`, `hover:bg-primary/90`,
`text-primary`, `ring-ring`, and hard-coded red/amber/emerald/blue/white/slate classes to the
danger / warning / `status-resolved` / info tint tokens, `bg-card` and `bg-muted`. Stragglers may
remain; fix them when touched.

### 3.5 Theme mechanism

- No `next-themes`. `lib/theme.ts` exports `THEME_STORAGE_KEY` (`porac-theme`) and `themeInitScript`,
  rendered inline in `app/layout.tsx` `<head>` before paint; it adds `dark` to `<html>` when
  `localStorage` is `"dark"`.
- `components/layouts/ThemeToggle.tsx` toggles the class and persists `"dark"` / `"light"`. Both
  icons render and CSS picks one, so there is no hydration mismatch. The toggle sits in
  `CitizenHeader` and `AdminHeader`.
- **Default is light.** There is deliberately no `prefers-color-scheme` auto-switch until dark
  surfaces are reviewed screen by screen (§10).
- Before this system, no `.dark` block or custom variant existed, so `dark:` utilities in shadcn
  components fired on the OS preference by accident. That is fixed.
- `.map-tile-muted` (muted grayscale basemap) has an inverted variant under `.dark`.

## 4. Typography

Fonts load in `app/layout.tsx` via `next/font/google`:

| Family | Variable | Use |
|---|---|---|
| **Inter** (variable, `opsz` axis) | `--font-inter` -> `--font-sans` | Body, forms, UI, tables. `font-optical-sizing: auto`. |
| **Montserrat** (variable) | `--font-montserrat` -> `--font-heading` | Headings: shadcn `CardTitle` / `DialogTitle` / `SheetTitle` and admin page `h1`s via `font-heading`. Figma specifies Montserrat Bold/ExtraBold. |
| **Geist Mono** | `--font-geist-mono` -> `--font-mono` | Machine values: IDs, coordinates, scores, timestamps. (Figma also allows JetBrains Mono.) Human-authored text is never mono. |

The logo wordmark is outlined vector; never retype it. Use `tabular-nums` wherever numbers align in
columns (table cells, KPI values, scores, IDs).

### Scale

Admin is the compact column, citizen the generous one.

| Role | Admin | Citizen | Weight | Family |
|---|---|---|---|---|
| Page title | 16 / 24 (`text-base`) as shipped | 28 / 36 target | 600 | Montserrat |
| Section heading | 16 / 24 | 18 / 26 | 600 | Montserrat |
| Card heading | 14-16 | 16 / 24 | 500-600 | Montserrat |
| Body | 14 / 20 | **16 / 24 (floor)** | 400 | Inter |
| Label | 12 / 16 | 14 / 20 | 500 | Inter |
| Table header | 10 / 16, +0.09em, uppercase | n/a | 700 | Inter |
| Table cell | 13 / 18, `tnum` | n/a | 400 | Inter |
| Caption | 12 / 16 | 13 / 18 | 400 | Inter |
| KPI value | 28 / 32, `tnum` | 24 / 30 | 600 | Inter |
| Badge | 11-12 | 12 | 500 | Inter |
| Data (IDs, coordinates) | 12 / 16, `tnum` | 13 / 18 | 400 | Geist Mono |

Uppercase is confined to table headers (`TABLE_HEAD_CLASS` in
`components/features/admin/shared/tableHead.ts`, the single definition) and the Queue KPI
micro-labels; not for navigation, buttons or section headings.

**The 16px citizen input floor is non-negotiable.** Below 16px, iOS Safari zooms the viewport on
input focus.

## 5. Layout foundations

### 5.1 Surface hierarchy

Three steps, never four: `background` (canvas) -> `card` (cards, tables, panels) -> `popover`
(floating layers). `--color-surface-subtle` / `--muted` is a lateral tint for table headers, footers
and inset wells, not a fourth elevation.

### 5.2 Borders

`--border` (decorative hairlines, card edges) and `--input` (control edges; meets 3:1).

### 5.3 Radii

`--radius: 0.5rem` (8px). Steps: `sm` 0.6x, `md` 0.8x, `lg` 1x, `xl` 1.4x (11.2px, cards),
`2xl` 1.8x, `3xl` 2.2x, `4xl` 2.6x. Buttons and inputs are `rounded-lg`; `Card` is `rounded-xl`;
shadcn `Badge` is `rounded-4xl` (pill). No `rounded-2xl` or larger on functional chrome.

### 5.4 Elevation

Cards have no shadow (1px border). `shadow-xs` for sticky headers only, `shadow-md` for
dropdown/popover/tooltip, `shadow-lg` for dialog/sheet/map popup.

### 5.5 Spacing and density

4-point scale (2, 4, 6, 8, 12, 16, 20, 24, 32, 40, 48, 64). One page-root gap per shell (admin
`gap-4`); skeletons match their page's grid and gap.

| | Admin | Citizen |
|---|---|---|
| Body text | 14px | 16px (floor) |
| Control height | `h-8` (default) / `h-9`, never below 24px target | 44px minimum, 48px preferred |
| Table row | 36-40px | n/a |
| Touch target | pointer-optimised | **44x44px hard floor** |

### 5.6 Icons and motion

Lucide: 16px inline, 18px sidebar, 20px standalone. No icon-in-a-coloured-tile chips on KPI cards.
120ms for colour/opacity on hover/focus, 150ms for layered enter/exit; no entrance animations.
`prefers-reduced-motion` is respected globally in `globals.css`; keep it.

### 5.7 Map

Leaflet sizing is shell-coupled: `main:has(> .admin-map-workspace)` is a full-bleed escape hatch and
`MapSizeInvalidator` drives `invalidateSize`. Heatmap gradient stays deliberately off-palette. Map
popups and controls are flat `card` + border + `shadow-md`.

### 5.8 The two admin card treatments

Which applies is decided by the surface; never mix them on one page.

**Dashboard treatment, gray frame.** `Card` with `bg-muted pt-2 pb-5` and a white `CardBodyPanel`
inset 5px. The strip above the panel is the header band. Coupled invariants: card `pt-2` equals the
header's `pb-2`; card `pb-5` pairs with `CardBodyPanel`'s `mb-[-17px]`. Used by `DashboardClient.tsx`.

**Queue treatment, plain card.** A single `rounded-xl border border-border bg-card` container, no
gray frame. Used by the Ticket Queue's KPI tiles and table card and by `/admin/flagged`. The table
card stacks four bands that each need their own fill: toolbar (`--card`), selection bar
(`--brand-subtle`), header strip and footer strip (`--color-surface-subtle`); a gray frame would read
as a fifth band.

Queue-surface rules:

- **The table is a CSS grid, not `<table>`.** Fixed px tracks live in
  `components/features/admin/tickets/queue/columns.ts`, the single source for the header strip, rows
  and `TicketQueueSkeleton`. `/admin/flagged` has its own `flagged/queue/columns.ts`; the two share a
  grammar (`TABLE_HEAD_CLASS`, row density), not a row type.
- **A status that acts on the public gets the only solid fill.** On `/admin/flagged`, Quarantined is
  a solid `--foreground` fill and the only solid button in the review drawer; Pending / Dismissed /
  Duplicate are dot-and-tint pills from the status ramp. Flag-type badges keep their own palette
  because flag type and moderation status are different axes in the same row.
- **Wide tables scroll inside their own card, never on the page body.** Column visibility is the
  escape hatch: hiding columns lowers the minimum width.

## 6. Component rules

### 6.1 Foundation and conventions

shadcn `radix-nova` components, restyled through tokens. Radix only (the `radix-ui` package); never
mix Base UI. Installed in `components/ui`: avatar, badge, breadcrumb, button, card, chart, checkbox,
command, dialog, dropdown-menu, input, input-group, kbd, pagination, popover, select, separator,
sheet, sidebar, skeleton, table, tabs, textarea, toggle, toggle-group, tooltip, plus the
app-specific `ImageLightbox`.

**Not installed; add only when a screen needs them (Phase 2+):** alert, alert-dialog, field/label,
radio-group, switch, accordion, empty, spinner, progress, sonner/toast, drawer, navigation-menu,
native-select, button-group, combobox.

The citizen and staff auth pages use `Field` / `Input` / `Button` / `Alert` (§8.5). Other citizen
forms (report form, account security) still use hand-rolled `<input>` / `<button>` styling with
tokens; migrating them is later Phase 2 work (§10).

- **Density:** citizen controls >= 44px tall; admin dense (`h-8` / `h-9`) but >= 24px targets.
- **Focus:** global `:focus-visible { outline: 2px solid var(--ring) }` plus the shadcn ring.
- **Validation:** `aria-invalid` tokens (destructive border plus a message, never colour alone).
- **Disabled:** `opacity-50` + `not-allowed`.

### 6.2 Per component

- **Buttons:** `default` is `bg-primary` with `primary-foreground`; `secondary` is a quiet surface;
  `ghost` is transparent with a tint on hover; `destructive` is the danger tint. Orange is never a
  button fill.
- **Inputs and selects:** `--input` edge, ring focus; error uses a destructive border plus a message.
- **Cards:** `bg-card`, 1px border, no shadow; use `--card-spacing` rather than per-instance padding.
- **Tables:** sticky header, micro-caps headers, 36-40px rows, 13px cells, `border` dividers, **no
  zebra striping**, `--brand-wash` hover/selected, always paired text labels on badges.
- **Tabs:** `line` variant for in-page switching; primary underline on active.
- **Badges:** the semantic home for status, flag, work-order and moderation values; always paired
  with a text label.
- **Dropdowns, dialogs, tooltips:** `popover` surface + border + `shadow-md` / `shadow-lg`.
- **Sidebar:** `--sidebar` surface with a border edge; active item uses `--sidebar-accent` fill and
  `aria-current`; never a side stripe alone. **Nav structure and labels are fixed** (E2E asserts
  them).
- **KPI cards:** `components/features/admin/shared/KpiCard.tsx`; label above value, optional delta
  as text (never a fill), no icon chip.
- **Empty and error states:** `EmptyState.tsx` and `AdminErrorCard.tsx` in
  `components/features/admin/shared/`; the citizen shell has its own `CitizenErrorState`.
- **Charts:** recharts; series from lifecycle / severity / office tokens; axes and grid at border
  tone. Brand colours are never a data series.
- **Loading:** `Skeleton` mirroring the real page grid.

## 7. Anti-patterns

- **Glassmorphism.** No `backdrop-blur` on cards, toolbars or panels. Known remaining violations:
  the citizen map's `GLASS_PANEL` (`PublicMapClient.tsx`) and the dialog overlay.
- **Gradients.** No gradient fills, text or accents anywhere (the auth photo has no scrim or caption).
- **Brand or orange as data.** No brand green/orange on a status, severity, flag, series or map marker.
- **Priority bands.** No Low / Medium / High derived from `priority_index`, in any colour.
- Decorative icon tiles; `rounded-2xl` or larger on chrome; zebra tables; colour-only meaning.
- **Raw palette classes for semantic colour,** and duplicate colour definitions (one token, one place).
- A fourth elevation level; mixing the two card treatments on a page (§5.8).
- Page-level horizontal scroll; shadows as default elevation.
- Uppercase micro-copy outside table headers and Queue KPI labels.
- Oversized headings in operational views.
- Logo misuse (§8.3).

## 8. Logo and brand assets

### 8.1 Files and component

Artwork in `public/brand/`: `logo-light.svg`, `logo-dark.svg` (primary horizontal, no subtitle) and
`symbol-light.svg`, `symbol-dark.svg`. Icons use the Next file conventions: `app/icon.svg` and
`app/favicon.ico` (simplified symbol on a green tile, no wave lines, readable at 16-32px),
`app/apple-icon.png` (180x180, full symbol) and `app/opengraph-image.png` (1200x630 cover).
`NEXT_PUBLIC_SITE_URL` (optional, default `http://localhost:3000`) is the `metadataBase` for the
absolute og:image URL; set it once the production domain is decided.

`components/layouts/BrandLogo.tsx`: props `variant` (`primary` | `symbol`), `tone` (`auto` | `light` |
`dark`), `height` (px; width follows the artwork). `auto` renders both and swaps with CSS `dark:`
classes, so there is no flash; use `tone="dark"` on always-dark surfaces.

### 8.2 Placement (Figma brand guide)

| Context | Rule |
|---|---|
| App header / expanded sidebar | Primary logo 28-32px tall (citizen header 28, admin sidebar 26). |
| Collapsed sidebar, avatars | Symbol; minimum 24px. |
| Below 32px | Use the simplified favicon artwork (`app/icon.svg`), not the full symbol. |
| Auth pages (citizen and staff) | Centered at the top of the form panel, 44px tall, `tone="auto"` (§8.5). |
| Minimum width | Primary logo 120px. |
| Subtitle lockup (min 280px) | Presentations, manuscript and formal documents only; never the app header. |
| Wordmark | Footers and tight horizontal spaces. |

Clear space equals the cap height of the wordmark.

### 8.3 Logo don'ts

No recolouring outside the shipped variants, gradients, shadows, outlines, stretching, retyping, or
shields / seals / gears. No logo on photos without a solid backing.

### 8.4 Asset provenance

The shipped files come from the owner-supplied brand package (`porac-sdss-brand-package.zip`, kept
outside the repo). Its README states the SVGs are the approved vectors, traced from the reference
logo with outlined Montserrat text, and that they are **not native Figma exports**; the designer's
original source was not available. They match the vectors placed in the Figma file `PORAC-SDSS`.
The wordmark-only, one-color (black / white) and subtitle-lockup variants stay in the ZIP and are
not imported, because the app does not use them yet; import a variant only when a screen needs it.

The subtitle on the lockup reads "Web-Based Decision Support System", which is the revised
manuscript title and the only official one. "Spatial Decision Support System" is the superseded
title and must not be used as the product name.

The package guide suggests keeping orange free to mean "High priority". The project rule wins:
Operational Priority is numeric with no bands, so orange is never a priority colour (§2).

### 8.5 Authentication pages and photograph

Citizen sign in / create account / forgot / reset and Staff sign in share `AuthShell`
(`components/features/auth/AuthShell.tsx`): a full-viewport, edge-to-edge 50/50 split on a
`min-h-dvh` grid, with no outer card, border, radius, shadow or margin. The form panel (plain
`bg-background`) is on the left with the form centered at `max-w-[420px]`; the photograph is on the
right, full height and `object-cover`, pinned (`sticky top-0 h-dvh`) so it stays in view while a long
form scrolls. Below `md` the photo is dropped and the form takes the full width. Nothing has a fixed
height, so create account and recovery states grow and scroll naturally. Form pieces are in
`AuthFields.tsx` (`PasswordInput` with an accessible show/hide toggle, `GoogleButton`, `AuthAlert` on
the shadcn `Alert`) and the `Field` / `Label` / `Alert` primitives in `components/ui`. The divider
label uses `bg-background` to match the form panel. The form column reads logo, heading, one-line
description, fields, primary button, "Or continue with" divider, Google, then the alternate-page link.
Google sits below the primary form and is citizen-only.

Spacing is set by three variables on `AuthShell`'s `<main>`: `--auth-gap` (between fields and
actions, read by `AUTH_GROUP` in `AuthFields.tsx`), `--auth-logo-gap` and `--auth-head-gap`. On
desktop they are 24 / 28 / 36px with a 44px logo and 8px between a label and its input (the
"Or continue with" divider sits about 26px from the button and from Google); the `compact` variant
(`@custom-variant` in `globals.css`: phones, or viewports 720px tall or less) tightens them to
20 / 20 / 28px so short laptops and phones keep the whole form reachable. The form is `max-w-[420px]`
and centered on the panel by a `1fr / auto / 1fr` grid, so the optional back link sits top-left in
its own row and never overlaps the form.

Text links use `AuthLink` (the `.link-underline` class in `globals.css`): a faint resting underline
that draws to full strength from the left over 180ms on hover and on keyboard focus, plus a
`focus-visible` ring. It is CSS only, and `prefers-reduced-motion` removes the transition. The Back
to Home arrow shifts 2px left on hover/focus, only under `motion-safe`.

**Back to Home is built but hidden.** `PUBLIC_HOME_HREF` in `AuthShell.tsx` is `null`: `/` redirects
to `/login` and every other citizen page needs an account (`proxy.ts`), so there is no public page
to link to, and a link would loop back to the page you are on. Set the constant to the public landing
route once one exists and the link appears top-left on all five auth pages (it was checked rendered
at desktop, short-laptop and phone sizes before being disabled).
There are no portal badges, no cross-portal links and no photo caption or scrim: staff sign-in stays
reachable at `/admin/login` and is not advertised on the citizen page (there is no public footer to
hold a Staff Access link yet; add one there if a public site is built). Staff has no registration,
Google or recovery link; the administrator-contact guidance stays. Privacy and Terms links are not
shown until those pages exist. The email and password fields carry no default values: any
credentials seen pre-filled come from the browser's own autofill, and `autoComplete` tokens are
kept so password managers work normally.

The registry output of `shadcn add login-04` was not applied directly: it would overwrite the repo's
`button`, `card`, `input` and `separator`, write `app/login/page.tsx` (colliding with the
`(citizen)/login` route) and add an npm package named `cn`. The block source was read with
`shadcn add login-04 --view`; `label`, `field` and `alert` were added from the official registry
with the `cn` import pointed at `@/lib/utils`.

Photograph (`public/images/auth-porac-jalung.jpg`): a cornfield and paddy at Jalung, Porac,
Pampanga (`File:810Jalung,_Porac,_Pampanga_06.jpg`, Wikimedia Commons), by Judgefloro, 2019-02-03,
CC0 (public domain dedication), so no attribution or credit overlay is needed. The bottom (road curb)
is cropped off and it is resized to 2000px wide. It is rendered by `AuthPhoto.tsx`, the single place
to change the photo (`src` and `object-position`): `next/image` with `fill`, `object-cover`,
`sizes="(min-width: 768px) 100vw, 1px"` (the panel is as tall as the viewport, so the photo renders
wider than the panel and needs a large variant), decorative (`alt=""`), no overlay, dimmed in dark
mode.

It is a plain farmland view. No licensed photograph of Inararo or of a Porac mountain view could be
found: Judgefloro's CC0 Porac set is roads, churches and schools. The most distinctive licensed
candidate is "Lake Pinatubo, Tarlac, Philippines - panoramio.jpg" (Andrew Martin, 2011, **CC BY 3.0**,
3504x2336; filed under Commons category "Porac, Pampanga"). It needs a visible credit ("Lake Pinatubo
by Andrew Martin, CC BY 3.0", linking the file page and the license) and the crater lake sits at the
Zambales-Tarlac-Pampanga tripoint, so it depicts Mount Pinatubo rather than Porac town itself. A
2024 portrait of the same lake (MikelleBandin, CC BY-SA 4.0) also exists. Project-owned Porac
photography (Inararo or the Pinatubo foothills) is the better long-term answer; to swap, replace the
file, update `AuthPhoto.tsx` and this paragraph and, if the new photo needs a credit, add it inside
the photo panel.

## 9. Accessibility

- **WCAG AA** on every token pair: 4.5:1 body text, 3:1 large text and UI components. `--sun`
  (3.9:1 on white) never carries small text; use `--sun-ink`. Control edges use `--input`, not
  `--border`.
- **16px citizen input floor** and **44x44px touch targets.** Auth inputs and buttons are `h-11`
  with 16px text.
- **Visible focus** everywhere through the global `:focus-visible` rule; do not hand-roll competing
  rings.
- **`aria-current`** on active navigation. The admin sidebar has it; the citizen header has no active
  state.
- **Redundant encoding.** Status and severity are spelled out; map pins use size and ring weight.
- **`prefers-reduced-motion`** respected globally.
- **Warm-hue collision.** `--sun`, `warning` and the map's `lahar` / `infra-safety` accents sit in a
  warm neighborhood and degrade together under deuteranopia / protanopia; keep map accents scoped to
  map layers and never rely on hue alone.
- **Dark theme:** contrast is computed for the core pairs in §3.1; screens, charts and Leaflet popups
  have not been reviewed in dark yet (§10).

## 10. Design sequencing

Not a roadmap; `docs/project-status.md` stays the only roadmap.

| Phase | Scope | Status |
|---|---|---|
| 1 | Brand tokens, light/dark theme, fonts, logo, theme toggle, class migration to semantic tokens | Shipped (this document) |
| 2A | Citizen and staff authentication redesign on the shadcn `login-04` layout (§8.5) | Shipped |
| 2 | Citizen Dashboard redesign; migrate the remaining citizen forms to shadcn Field / Input / Button; fix the 44px / 16px floors | Not started |
| 3 | Staff shell and queue polish | Not started |
| 4 | Dark-mode review screen by screen (maps, charts, Leaflet popups), then decide on a `prefers-color-scheme` default | Not started |
| Assets | Official logo, icon, apple icon and OG cover imported (§8.4) | Shipped |

## 11. Implementation risks

- **No visual-regression tooling.** E2E asserts text and roles, not pixels; QA manually at 360 / 768 /
  1440px, in both themes.
- **E2E selectors are structural.** The suite depends on the exact admin nav list, `aria-current`,
  real `<table>` markup, `data-slot` attributes, recharts internals, the citizen barangay native
  `<select>`, `.leaflet-container` clicks and exact visible copy. Restyle without changing markup or
  copy.
- **Custom breakpoints are load-bearing:** `--breakpoint-dashboard: 75rem`, `--breakpoint-wide: 85rem`.
- **Chart and status tokens are consumed by name.** Rename them only with all consumers.
- **Global tokens have global reach.** Changing a token affects every surface that consumes it,
  including files that were not edited.
