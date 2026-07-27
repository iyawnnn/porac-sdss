# AC-CORE Design System

Civic infrastructure reporting for Angeles City. Two audiences, one system: LGU staff (CEO / ACDRRMO) working dense ticket queues for hours at a desk, and citizens filing hazard reports outdoors on a phone, often under stress.

The system optimizes for **reading speed and low cognitive load**, not visual interest. Every color that carries meaning carries exactly one meaning.

> **Status:** design specification only. Nothing in this document is implemented yet. See §9 for the ordered implementation plan and §8 for the defects it fixes.

---

## 1. Foundational rules

1. **One meaning per color channel.** The warm ramp means urgency and nothing else. Violet means integrity flag and nothing else. Neither ever appears as chrome. Brand blue is chrome, and is additionally the basis of the status progression (§2.3) — that sharing is deliberate and bounded: saturated brand weights (500+) as a *fill* are chrome-only, so a status pill can never be mistaken for a button or link.
2. **Geist Mono is semantic, not decorative.** It marks machine-produced values — ticket IDs, coordinates, elevation, urgency scores, perceptual hashes, timestamps. Human-authored text (report titles, descriptions, barangay names) is always Geist Sans. Mono signals "the system computed this."
3. **Borders, not shadows.** Institutional software should read as precise, not floaty. Elevation is expressed with 1px borders. Only the sticky table header and Leaflet popups get a shadow.
4. **Density is per-audience.** Admin surfaces are compact (40px rows, 13px text). Citizen surfaces are generous (48px controls, 16px text). Same tokens, different steps on the same scale.

---

## 2. Color tokens

Light theme only (see §7). Tokens are defined as Tailwind v4 `@theme` custom properties in `app/globals.css`. This project is Tailwind **4.3.3, CSS-first** — there is no `tailwind.config.js` and none should be added.

**Hex is canonical.** The `oklch` column is an approximate reference for reasoning about hue separation and lightness. Tailwind v4 accepts either, but use the hex values verbatim in `@theme` — do not transcribe the oklch figures as literals without regenerating them from the hex, or the two will drift.

### 2.1 Brand — chrome only

Nav, links, primary buttons, focus rings, Pizza Tracker progress. **Never** used to indicate severity, urgency, or risk.

| Token | Hex | oklch (approx.) | Use |
|---|---|---|---|
| `--color-brand-50` | `#EFF5FC` | `oklch(0.97 0.014 250)` | Subtle fills, Under Review pill (§2.3) |
| `--color-brand-100` | `#D8E6F7` | `oklch(0.92 0.033 250)` | Selected row, active filter chip |
| `--color-brand-300` | `#8FB6DE` | `oklch(0.76 0.077 250)` | Decomposition bar, segment 1 |
| `--color-brand-500` | `#2B6CB0` | `oklch(0.52 0.110 250)` | Primary button, link, focus ring |
| `--color-brand-600` | `#22578E` | `oklch(0.45 0.098 250)` | Hover / active |
| `--color-brand-700` | `#1A4570` | `oklch(0.38 0.082 250)` | Nav bar, heading accent |
| `--color-brand-900` | `#102943` | `oklch(0.26 0.052 250)` | Deepest text on brand tints |

Deep institutional blue was chosen over teal for maximum hue distance from the warm urgency ramp (250° vs. 27–85°), so urgency badges never compete with chrome.

### 2.2 Urgency — the computed triage scale

**Applies to `urgency_band` only.** Ticket list badge, ticket detail score, map pin. Never a button, never a border, never a nav element, and never `citizen_severity` (see §5.4).

Three bands, matching `lib/triage/urgency.ts` exactly: `< 0.40` Low · `0.40–0.70` Medium · `> 0.70` Critical. There is no fourth band.

| Band | Solid | Tint bg | Ink | Edge |
|---|---|---|---|---|
| Low | `#D99A00` | `#FDF3D7` | `#6B4A00` | `#EFD79A` |
| Medium | `#E2680E` | `#FDE7D3` | `#8A3A00` | `#F5C09A` |
| Critical | `#C42B1C` | `#FADCD9` | `#8A1D12` | `#EDA9A1` |

Token names: `--color-urgency-{low,medium,critical}` plus `-tint`, `-ink`, `-edge` suffixes.

**Escalation rule — Low and Medium are tinted, Critical is solid.** In a 40-row queue, three pastel chips give every row equal visual weight and nothing stands out. Critical uses the solid fill with white text so the eye lands on it first while scanning. This asymmetry is the main reason the ramp exists; a uniform set of three tints would be decoration.

> **Known cost of a warm-only ramp.** Yellow → orange → red collapses toward similar tones under deuteranopia and protanopia. Hue alone is therefore never sufficient anywhere in this system. Badges always spell out the band name (§5.1) and map pins additionally encode band as size and ring weight (§6.2). This is mitigated, not ignored.

### 2.3 Status — cool progression, deliberately quiet

Applies to `ticket_status`. Reads as *movement through a pipeline*, not as category or severity. Stays cool so it can never be mistaken for urgency.

| Status | Tint bg | Ink | Dot | Source |
|---|---|---|---|---|
| Reported | `#F1F3F5` | `#434B54` | `#98A2AC` | neutral |
| Under Review | `#EFF5FC` | `#1A4570` | `#2B6CB0` | `brand-50` / `-700` / `-500` |
| In Progress | `#D8E6F7` | `#102943` | `#22578E` | `brand-100` / `-900` / `-600` |
| Resolved | `#E3F5EE` | `#0B5741` | `#0F7A5A` | own (cool green) |

Deepening blue tint signals progress. Resolved switches to a cool green (hue ~160°) — far from both the urgency ramp (27–85°) and brand blue (250°) — so "done" can never read as "low urgency".

**These are brand tokens, reused exactly.** Under Review and In Progress reference `brand-50`/`brand-100`, `brand-700`/`brand-900`, and `brand-500`/`brand-600` verbatim — no new blues are introduced. Status is a *progression*, and the brand ramp is already one; inventing a second, near-identical family of blues would produce values that read as mistakes rather than decisions. Only Reported (neutral) and Resolved (cool green) sit outside the brand ramp, because "not started" and "closed" are genuinely not steps along it.

Two constraints follow from that reuse, and both are binding:

- **Brand tints may not be used as a background behind a status pill.** Admin row hover therefore uses `--color-canvas`, not `brand-50` — otherwise the Under Review pill (`#EFF5FC`) disappears into a hovered row (§4.1).
- **Status never uses a saturated brand fill.** `brand-500`+ as a fill is reserved for buttons and links, so a pill is never mistaken for a control.

### 2.4 Integrity flags — violet, off both ramps

Covers `LOCATION_MISMATCH`, `STALE_PHOTO`, `NO_EXIF`, `DUPLICATE_IMAGE:<id>`, `BOUNDARY_FALLBACK:<barangay>:<metres>`.

| Token | Hex |
|---|---|
| `--color-flag` | `#7B2FA8` |
| `--color-flag-tint` | `#F3E8FB` |
| `--color-flag-ink` | `#5B2178` |
| `--color-flag-edge` | `#DDBDF0` |

Flags are red today, which is also Critical urgency — so a flagged Low-urgency report currently looks like a Critical one. Violet (hue ~300°) sits outside brand, urgency, and status, so it can only mean "integrity signal."

This also gives a clean answer at defense: fraud signals were deliberately kept off the severity channel so they cannot be misread as severity. Per PLAN.md §8 flags never block submission, so the styling stays informational — never alarm-red.

### 2.5 Neutrals

Slightly cool, to sit correctly against the blue.

| Token | Hex | Use |
|---|---|---|
| `--color-canvas` | `#F7F9FB` | Page background |
| `--color-surface` | `#FFFFFF` | Cards, table body, inputs |
| `--color-line-100` | `#EDF0F3` | Row dividers |
| `--color-line-200` | `#E1E6EB` | Card and input borders |
| `--color-ink-400` | `#808C99` | Meta, timestamps, placeholders |
| `--color-ink-500` | `#5A6672` | Secondary text, table headers |
| `--color-ink-700` | `#2E3841` | Body text |
| `--color-ink-900` | `#10151A` | Headings |

All foreground/background pairs in this document are **designed** to clear WCAG AA (4.5:1 body, 3:1 large text and UI). They have not been instrumentally measured — verify each pair with a contrast checker during implementation and correct any that miss.

---

## 3. Typography

Geist Sans and Geist Mono, both already loaded in `app/layout.tsx` via `next/font/google` and already wired into `@theme` as `--font-sans` / `--font-mono`. **No new font loading is required.** See §8.1 for the one-line bug currently preventing Geist Sans from rendering.

| Role | Size / line-height | Weight | Tracking | Family |
|---|---|---|---|---|
| `display` | 28 / 34 | 600 | −0.02em | Sans |
| `h1` | 20 / 28 | 600 | −0.01em | Sans |
| `h2` | 16 / 24 | 600 | −0.005em | Sans |
| `body-lg` | 16 / 26 | 400 | 0 | Sans |
| `body` | 15 / 22 | 400 | 0 | Sans |
| `sm` | 13 / 18 | 400 | 0 | Sans |
| `label` | 12 / 16 | 500 | +0.04em, uppercase | Sans |
| `data` | 13 / 18 | 400 | 0, `tabular-nums` | **Mono** |
| `score` | 28 / 32 | 500 | −0.01em, `tabular-nums` | **Mono** |

- **Admin default is `body` (15px)** — compact enough for dense tables without straining.
- **Citizen default is `body-lg` (16px).** 16px is a hard floor for form inputs: below it, iOS Safari zooms the viewport on focus, which is disorienting for someone standing outdoors in the rain trying to report a flood.
- `label` is the uppercase micro-label used for table headers and form field labels.
- `data` covers ticket IDs, coordinates, elevation, member counts, timestamps, and phash values. `tabular-nums` keeps numeric columns aligned.
- `score` is reserved for the single large urgency number on the ticket detail page.

---

## 4. Spacing, density, shape

**Spacing scale (4-based):** 2, 4, 6, 8, 12, 16, 20, 24, 32, 40, 48, 64.

**Radius:** `sm` 4px (badges) · `md` 6px (inputs, buttons) · `lg` 8px (cards) · `full` (pills, dots).

**Container widths:** admin lists `max-w-7xl` · admin detail `max-w-4xl` · citizen pages `max-w-xl`. These are currently inconsistent per page (`6xl` / `3xl` / `2xl` / `sm`) and should be unified.

### 4.1 Admin density

- Table row height **40px**; cells `px-3 py-2`; `sm` (13px) text.
- Header row uses `label` style in `--color-ink-500`, with a 1px `--color-line-200` bottom border, **sticky** on scroll.
- Row separation is a 1px `--color-line-100` divider. **No zebra striping** — dividers plus hover are sufficient, and alternating fills fight the urgency badges for attention.
- Row hover: `--color-canvas` (`#F7F9FB`), **not** `brand-50` — `brand-50` is the Under Review status pill's background, and a hovered row would swallow the pill (§2.3).
- Numeric columns (`member_count`, `urgency_score`) are right-aligned in `data` style. Text columns are left-aligned.
- **Split the urgency column in two.** Band and score are currently crammed into a single badge rendered as `Low (0.383)`, so neither scans well. They become two adjacent columns: a band badge, then the mono score.

### 4.2 Citizen density

- Inputs and buttons: **48px minimum height**, `px-4`, 16px text, `md` radius, 1px `--color-line-200` border.
- All interactive targets at least 44×44px.
- Labels sit **above** their inputs (`label` style, `--color-ink-700`, 6px gap). The report form currently uses placeholder-only inputs, which disappear on focus and are unreliable for screen readers.
- 20px vertical rhythm between fields.
- Severity selection becomes a **segmented control** of four 48px-tall buttons rather than bare `<input type="radio">` elements with a 4px gap. Current targets are roughly 16px — effectively unusable with wet hands outdoors.
- Errors: 14px, `--color-urgency-critical-ink`, icon plus text, in an `aria-live="polite"` region.

### 4.3 Focus and motion

- **Focus ring:** `2px solid var(--color-brand-500)` with `outline-offset: 2px`, on every interactive element. No focus styling exists anywhere in the app today — this is the accessibility floor, not a refinement.
- **Motion:** limited to 120ms color transitions on hover and focus. No entrance animations, no scroll-triggered effects. All motion wrapped in `@media (prefers-reduced-motion: reduce)`.

---

## 5. Components

### 5.1 Urgency badge

Low and Medium use tint background + ink text + 1px edge border. Critical uses the solid `#C42B1C` fill with white text at 500 weight. The band name is **always spelled out** — never communicated by color alone (§2.2).

### 5.2 Status pill

Tint background + ink text + an 8px leading dot, per §2.3. The dot provides a second channel beyond hue.

### 5.3 Flag chip

Violet tint + `⚑` glyph + label, with plain-language evidence text beside it in `--color-ink-500`. The evidence strings already written in `app/admin/flagged/page.tsx` (e.g. "350m from photo's EXIF GPS", "photo taken 31.2h before submission") are well-phrased and should be kept verbatim.

### 5.4 Severity display (`citizen_severity`)

**Deliberately uncolored.** Rendered as `label`-style text — `REPORTED AS · Critical` — in `--color-ink-500`. Never a colored badge.

`citizen_severity` has four values (Low / Medium / High / Critical) and is subjective citizen input. `urgency_band` has three values and is computed output. PLAN.md §5 makes their separation an explicit defense argument: the triage engine does independent work rather than restating what the citizen typed. If both rendered as colored chips, that distinction would be invisible, and a panelist could reasonably ask whether the system is just echoing the reporter. Keeping severity typographic and urgency chromatic makes the independence legible at a glance.

### 5.5 Signature element — the urgency decomposition bar

**The one element this interface should be remembered by.** It sits above the existing factor table on `/admin/tickets/[id]`.

A single horizontal track (`--color-line-100`, 8px tall, `lg` radius) divided into three segments — Elevation, Precipitation, Cluster — each capped at one third of the total width and filled proportionally to its actual contribution (`factor / 3`). Segments use `brand-300`, `brand-500`, `brand-700` left to right. Beneath sit three micro-labels with values in `data` style.

```
System urgency

  0.713   ● Critical
  ┌────────────┬────────────┬────────────┐
  │██████░░░░░░│███████████░│████████████│
  └────────────┴────────────┴────────────┘
    E 0.184      P 0.267      C 0.262
    elevation    rainfall     cluster
```

Segments are **brand blue, not the urgency ramp** — deliberately. The bar answers *where the score came from*, not *how severe it is*. Coloring the elevation segment yellow would imply elevation is "low urgency", which is a category error. Magnitude is carried by fill length; the band is carried by the badge and number above.

Why this earns the signature slot: the three-factor weighted formula **is** the research contribution (PLAN.md §7). "How did you arrive at 0.71?" is the single most likely question at defense, and this answers it in one glance — with no animation, no chart library, and no data that isn't already on the page.

---

## 6. Surface-specific rules

### 6.1 Admin shell (does not exist yet)

There is currently no navigation between `/admin/tickets`, `/admin/map`, and `/admin/flagged` — each admin page is a standalone `<main>`, so moving between them requires editing the URL. For staff using this daily, that is the largest structural gap in the product.

Add a persistent header: wordmark, three nav links, the signed-in admin's office badge (CEO / ACDRRMO), and sign-out. The office badge uses neutral chrome — **not** the urgency ramp.

The office-scope state (own office vs. full city) is currently inline body text plus a bare link on the ticket list. It belongs in this shell as a visible, persistent toggle.

### 6.2 Map pins

Hue alone fails here: pins are small, the ramp is warm-only, and the audience includes colorblind users. Encode band on **two** channels.

| Band | Diameter | Fill | Ring |
|---|---|---|---|
| Low | 12px | `--color-urgency-low` | 1.5px white |
| Medium | 16px | `--color-urgency-medium` | 1.5px white |
| Critical | 20px | `--color-urgency-critical` | 2px white + 1px `#8A1D12` outer |

Size and ring weight both track severity, so the map stays readable in greyscale. The barangay choropleth stays a very low-opacity neutral so it never competes with pins.

### 6.3 Pizza Tracker (citizen status timeline)

Structurally correct already; needs retokenizing only. Reached steps get a filled `brand-500` dot, the current step gets a brand ring, future steps stay `line-200`. Connector lines follow the same rule. Timestamps render in `data` style.

---

## 7. Deliberate exclusions

- **Dark mode.** `globals.css` currently has a `prefers-color-scheme: dark` block that swaps two variables no page actually respects — every page hardcodes `bg-white` / `text-gray-900`, so dark mode is already broken in practice. It is removed rather than left half-working. Every token here is named semantically (`--color-surface`, not `--color-white`), so adding dark later is a second `@theme` block, not a re-audit of every component. Note that Leaflet tiles would also need a dark variant or filter, or the map stays blazing white inside a dark shell.
- **Component library / design-system package.** About ten screens, mostly server components. Tokens plus a handful of local components is correctly sized; a published package is not.
- **Charting dependency.** No analytics dashboard exists. The decomposition bar (§5.5) is hand-rolled CSS.
- **Login screens** (`/admin/login`, `/login`, `/signup`). Three fields each. They inherit everything from the token layer for free and carry no demo value.

---

## 8. Defects this system fixes

Found while auditing the current UI. Listed worst-first; these are the justification for most decisions above.

### 8.1 Geist is loaded but never renders — fix this first

`app/layout.tsx` correctly loads `Geist` and `Geist_Mono`, and `globals.css` correctly wires them into `@theme`. But `globals.css` then sets:

```css
body {
  font-family: Arial, Helvetica, sans-serif;   /* ← overrides Geist Sans */
}
```

That type selector wins for all body text. The `font-mono` utility still works, because a class selector outranks a type selector — so the app currently renders **Arial for prose and Geist Mono for numbers**, which is why the mixture looks slightly off without being obviously wrong.

Deleting that one declaration is the highest-leverage change in this document: it visibly corrects every screen at once, with no component edits.

### 8.2 Four color systems collide on the same chips

| Tailwind chip | Currently means | …and also means |
|---|---|---|
| `bg-amber-100` | Medium urgency | "Under Review" status |
| `bg-green-100` | Low urgency | "Resolved" status |
| `bg-red-100` | Critical urgency | Integrity flag |

On the ticket detail page these appear within a few hundred pixels of each other. For staff reading the queue for hours, this is the single largest cognitive-load defect, and it is what §2's one-meaning-per-channel rule exists to fix.

### 8.3 Urgency colors are defined twice and already drifting

The band → color mapping exists independently in two places: Tailwind classes on the ticket list, and raw hex (`#16a34a` / `#f59e0b` / `#dc2626`) for map pins. Nothing keeps them in sync. They should collapse into one exported map consumed by both.

Note that both current definitions use **green** for Low. Green reads as "good/fine", but every row in this queue is a hazard — nothing in it is good. The yellow → orange → red ramp is more honest: it encodes intensity, not valence.

### 8.4 Smaller items

- No `:focus-visible` styling anywhere in the app.
- Citizen inputs are ~34px tall (below the 44px touch minimum) and under 16px (triggering iOS zoom on focus).
- Report form fields are placeholder-only, with no persistent labels.
- Container widths differ arbitrarily per page.

---

## 9. Implementation priority

Ordered for a defense demo. Phase 0 is a prerequisite for everything after it.

**Phase 0 — Foundation.** Token layer in `globals.css` (including the §8.1 Arial deletion and removing the dead dark block), global focus ring, one shared band→token map replacing the two drifting copies, and the admin shell (§6.1). Nothing else can be done cleanly first, and the Arial fix alone changes every screen.

**Phase 1 — `/admin/tickets`.** The default admin view and densest surface. Sticky header, 40px rows, split band/score columns, filter bar as chips, office scope moved into the shell.

**Phase 2 — `/admin/tickets/[id]`.** Build the decomposition bar (§5.5) above the existing factor table, retokenize the panel, apply the severity rule (§5.4) to member reports. This is the screen the research contribution lives on.

**Phase 3 — `/report`.** Labels above inputs, 48px controls, segmented severity control, restyled photo/EXIF states, `aria-live` errors, coordinate readout in `data` style.

**Phase 4 — `/admin/map`.** Pin encoding (§6.2), a legend, choropleth opacity.

**Phase 5 — Sweep.** `/admin/flagged` violet chips, `/dashboard` status pills, Pizza Tracker retokenize. Mostly mechanical once tokens exist.

### Note on ordering

An earlier draft of this priority list put `/admin/map` third and `/report` fourth. Two changes were made:

**`/report` moves ahead of `/admin/map`.** It has the worst genuine defects (sub-44px targets, placeholder-only labels, sub-16px inputs that trigger iOS zoom), it is the demo's opening move — submit a report, watch it land in the admin queue — and it is the only screen a non-technical panelist pictures themselves using. `/admin/map` looks impressive, but most of its pixels are Leaflet's own tile rendering; its one high-value change is pin encoding, which is roughly twenty lines and already covered by Phase 0's token work.

**Phase 0 was added ahead of everything.** Without a token layer, restyling four pages means hardcoding the same values four more times and deepening the drift described in §8.3.
