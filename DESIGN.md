# PORAC-SDSS Design System v2

Civic infrastructure reporting for the Municipality of Porac. Two audiences, one system: LGU staff (MEO / MDRRMO) working dense ticket queues for hours at a desk, and citizens filing hazard reports outdoors on a phone, often under stress.

> **Status: authoritative, supersedes the prior version.** The document previously at this path (dated to the original Phase 0–5 design pass) is now **historical only** — see §0 for what survived the audit and what didn't, and `git log -- DESIGN.md` for its full prior text. Nothing in the old document should be treated as a constraint just because it was written there; every rule below was re-derived against the current codebase, not copied forward.

Design direction: **Linear-inspired precision, not Linear's branding.** Clean, quiet, information-dense, operational — the visual register of a serious internal tool, not a marketing surface. PORAC keeps its own hue family, its own type pairing, and its own accent system; nothing here is a reskin of Linear's product.

---

## 0. Audit findings — what changed and why

The old document's own status line claimed "implemented... verified via Playwright." That was true structurally (the citizen surfaces genuinely follow it), but a direct read of the current admin code shows the admin half of that claim doesn't hold:

| Finding | Evidence | Verdict |
|---|---|---|
| **Glassmorphism is in production on the admin side.** `rounded-xl border border-slate-200/60 bg-white/90 backdrop-blur-md shadow-sm` (`GLASS_CARD` in `DashboardClient.tsx`) is used for every KPI tile, and the same pattern (`backdrop-blur-md`, translucent white) recurs in `KpiBar.tsx`, `MapControls.tsx`, `HorizontalStatusTracker.tsx`, `TicketsWorkspace.tsx`'s filter toolbar, and `TriagePanel.tsx` — 7 admin files total. | Directly contradicts the old doc's own §1.3 ("Borders, not shadows... institutional software should read as precise, not floaty") and this phase's explicit anti-pattern list. | **Replaced.** No glass anywhere in v2. |
| **Raw, non-token Tailwind colors on the admin side.** `text-rose-600`, `text-emerald-600`, `text-indigo-600`, `bg-slate-50/80`, `border-slate-200/80` appear across 10 admin files (dashboard, tickets, flagged, map, triage, auth). | Confirms the old doc's own §8.3 defect ("urgency colors defined twice and already drifting") was never fully closed — it recurred in different files. | **Replaced** with a token system that has no raw-Tailwind-color escape hatch for anything semantic. |
| **Side-stripe active nav item.** `AdminSidebar.tsx`'s active link is `border-l-2 border-indigo-500` on a `bg-slate-800/80` pill. | A well-documented SaaS-admin tell (colored left bar as the only signal); also introduces `indigo-500`, a hue this system never otherwise uses. | **Replaced** with a full-fill active state (§6.1) — no side stripe anywhere in v2. |
| **`AdminSidebar` / `app/admin/layout.tsx` are already dark** (`bg-slate-950`, `bg-slate-50/50`) despite the old doc declaring "light theme only" system-wide. | The admin shell was never actually retokenized to the old doc's light system — it's been running an ad hoc dark theme this whole time, undocumented. | **Kept dark, now deliberately.** v2 makes the admin shell's dark theme an intentional, tokenized decision instead of an unplanned deviation (see §2 architecture note). |
| **Citizen surfaces are clean.** `CitizenHeader.tsx`, `app/(citizen)/layout.tsx`, `app/(citizen)/reports/page.tsx` all consume `--color-*` tokens correctly, with no glass and no raw Tailwind colors (`PublicMapClient`/`PublicTicketPopup`/`ReportForm` have minor raw-color spots, scoped to Leaflet popups — low priority). | The citizen half of the old design pass genuinely was implemented as documented. | **Retained.** Citizen shell keeps its structure, its 16px/48px accessibility floors, and its token discipline. Only the palette and radius scale shift slightly (§5, §7). |
| **Urgency ramp, status progression, integrity-flag violet.** Warm-only urgency ramp with the tint/solid escalation asymmetry, the "status reuses brand tokens as a progression" rule, and the violet-for-integrity-flags isolation (old §2.2–§2.4). | These are genuinely good decisions: colorblind-aware, semantically isolated, still correctly describe the domain (three independent meaning-channels: urgency / status / integrity). Nothing about the redesign changes what these need to communicate. | **Retained as concepts**, re-tuned only where a token needs a dark-surface-safe variant (§4.3–§4.5). |
| **16px citizen input floor, 44×44px touch targets, `prefers-reduced-motion` support, no dark-mode *toggle*.** | Correct, accessibility-driven, still true regardless of any visual refresh. | **Retained exactly.** See the clarification on "dark mode" below — it changes meaning, not policy. |

**On "dark mode."** The old doc's exclusion (§7) was about a *toggleable* `prefers-color-scheme` dark mode that no page actually respected — a broken, half-built feature, correctly removed. That decision is untouched: **there is still no theme toggle anywhere in this app.** What v2 does instead is give the **admin shell one fixed dark theme** and the **citizen shell one fixed light theme** — two single-theme surfaces, not a switchable dark mode. This matches what `AdminSidebar.tsx` has quietly been doing already; v2 just makes it a designed, tokenized decision instead of an accidental one, and makes it Linear-like on purpose (operational tools read as serious work environments in a dark, low-glare shell; a public-facing citizen form reads as approachable and legible in daylight, which favors light).

---

## 1. Foundational rules

1. **One meaning per color channel — unchanged from v1, still the load-bearing rule.** Urgency, status, and integrity flags are three independent systems. None of them is ever repurposed as chrome, and no two of them may share a hue family. The map accent colors introduced in §4.6 add three *new* channels (terrain, waterway, lahar/earth) that must obey the same rule: map-only, never UI chrome, never colliding with urgency/status/flag hues.
2. **Borders, not shadows — reaffirmed, now enforced with no exceptions.** The audit found the one place this rule was being violated (admin glass cards) and that violation is exactly what v2 removes. Elevation is a 1px border and, on the admin dark shell, a lightness step between `canvas` → `surface` → `surface-elevated` (§2). Shadows are reserved for genuinely floating layers: dropdowns, popovers, sheets, dialogs, map popups — the things shadcn already ships a shadow for by default.
3. **Density is per-shell, not per-preference.** Admin is compact by design (13px text, 36–40px rows) because its users read it for hours. Citizen is generous by design (16px text, 44–48px controls) because its users are one-handed, outdoors, and often in a hurry. This was true in v1 and remains true — only the exact numbers tighten slightly on the admin side (§3).
4. **Mono is semantic, not decorative — unchanged.** Ticket IDs, coordinates, elevation, urgency scores, timestamps, perceptual hashes: always mono. Human-authored text: never mono. Geist Mono is kept (already loaded, already correct — see §3.4 on why it isn't being swapped for a "Linear-style" mono).
5. **The admin shell and citizen shell share tokens, not a theme.** Both read from the same semantic variable names (`--color-canvas`, `--color-brand-500`, `--color-urgency-critical`, etc.); the admin shell overrides the *neutral* and *brand-lightness* values for its dark surface via a single scoping attribute (`[data-shell="admin"]`), while urgency/status/flag/map-accent tokens stay hue-identical across both shells and only shift lightness where a dark background demands it for contrast. This is what "shared brand identity without copying the admin density" (from the brief) means concretely: one palette, two renderings.

---

## 2. Architecture: how the token override works

Tailwind v4 is CSS-first (`@theme` in `app/globals.css`, no `tailwind.config.js` — unchanged from v1, still correct, still the right call for this Next.js 16 / Tailwind v4 setup). The dark admin shell is implemented the same mechanical way v1's (now-deleted) `.dark {}` block would have worked, just repointed at a shell selector instead of a color-scheme preference:

```css
@theme {
  /* semantic tokens, default (citizen/light) values */
  --color-canvas: #F7F9FB;
  --color-surface: #FFFFFF;
  /* ...etc., full list in §4 */
}

[data-shell="admin"] {
  /* same variable names, dark values */
  --color-canvas: #0E1116;
  --color-surface: #14171D;
  /* ...etc. */
}
```

`app/admin/layout.tsx`'s root wrapper gets `data-shell="admin"`; `app/(citizen)/layout.tsx`'s root wrapper is left alone (light values are the `@theme` default, so citizen needs no override at all). Every component below both shells keeps using the exact same `bg-canvas` / `text-ink-primary` / `bg-brand-500` utility classes — **no component needs to know which shell it's in.** This is the same override mechanism Tailwind v4 already uses for `.dark`, just aimed at a shell attribute instead of a color-scheme class, so there is no new build tooling, no new PostCSS plugin, and no risk to the existing Tailwind v4 setup.

---

## 3. Typography

### 3.1 Verified font availability (do this before implementing)

**"Inter Display" is not a real, separately-licensed Google Font, and is not available through `next/font/google`.** Verified directly against the installed Next.js font catalog (`node_modules/next/dist/compiled/@next/font/dist/google/font-data.json`, 1,911 families): only `"Inter"` and `"Inter Tight"` exist. Linear's actual "Inter Display" is a self-hosted, separately licensed cut that isn't publicly redistributable — **do not download or commit any such font file**; there is no verified, legal source for it in this project.

**The good news:** the same catalog entry confirms `Inter` ships as a **variable font with a real optical-size axis**:

```json
"axes": [
  { "tag": "opsz", "min": 14, "max": 32, "defaultValue": 14 },
  { "tag": "wght", "min": 100, "max": 900, "defaultValue": 400 }
]
```

That `opsz` axis is exactly the mechanism a real "Display" cut would use — tighter spacing and more refined details at larger sizes. `next/font/google`'s `Inter` loader can request the `opsz` axis explicitly, and modern browsers additionally support `font-optical-sizing: auto`, which lets the browser interpolate `opsz` from the rendered `font-size` automatically, no manual per-element tuning required. Browsers without support just render at the default `opsz: 14` — still correct Inter, no breakage, no layout shift.

**Recommendation: one font family (Inter, variable), two roles.** There is no separate "display" font file — the "display" role is Inter at a heavier weight, larger size, tighter tracking, and `font-optical-sizing: auto` engaging the upper end of the `opsz` axis. This is the same "one face, multiple roles via type scale" approach the old doc already used for Geist Sans, just correctly sourced this time.

### 3.2 Font loading (Next.js, zero layout shift)

```ts
// app/layout.tsx
import { Inter } from "next/font/google";

const inter = Inter({
  subsets: ["latin"],
  axes: ["opsz"],           // pulls in the optical-size axis of the variable font
  variable: "--font-geist-sans", // keep the existing CSS var name — zero call-site churn
  display: "swap",
});
```

Using `next/font/google` (not a `<link>` tag, not self-hosted files copied by hand) is what actually satisfies "preserve performance and avoid layout shift": Next.js self-hosts the font at build time, computes size-adjusted fallback-font metrics automatically, and inlines the `@font-face` — this is the exact same mechanism already in place for Geist Sans/Mono today, so swapping the family is a one-line import change with no new infrastructure. Keeping the CSS variable name (`--font-geist-sans`) unchanged means `globals.css`'s `@theme inline { --font-sans: var(--font-geist-sans); }` line doesn't need to change either — only `app/layout.tsx`'s import changes. (The variable name becoming slightly inaccurate — it now holds Inter, not Geist — is a one-line comment fix, not a functional issue; a follow-up rename to `--font-inter` is optional cleanup, not required for correctness.)

```css
/* app/globals.css — add once, harmless global default */
html {
  font-optical-sizing: auto;
}
```

### 3.3 Type scale — Admin (dense, restrained; no oversized headings)

Linear's own product headings are modest even on primary pages — this is deliberate, and directly answers the brief's anti-pattern ("oversized headings inside operational views"). The admin page-title shrinks from the old scale's 20/28 to 18/24; nothing in the admin type scale should ever need to compete with a table row for attention.

| Role | Size / line-height | Weight | Tracking | Family |
|---|---|---|---|---|
| `page-title` | 18 / 24 | 600 | −0.01em | Inter |
| `section-heading` | 14 / 20 | 600 | −0.005em | Inter |
| `body` (admin default) | 13 / 18 | 400 | 0 | Inter |
| `body-emphasis` | 13 / 18 | 500 | 0 | Inter |
| `label` (table headers, micro-labels) | 11 / 14 | 500 | +0.04em, uppercase | Inter |
| `data` (IDs, coords, timestamps, counts) | 12 / 16 | 400, `tabular-nums` | 0 | **Geist Mono** |
| `score` (the one large urgency number, ticket detail only) | 24 / 28 | 600, `tabular-nums` | −0.01em | **Geist Mono** |

### 3.4 Type scale — Citizen (generous, unchanged accessibility floors)

The citizen scale keeps every number that was accessibility-driven in v1 (the 16px input floor, the 26–28px page-title range) and only trims the top end slightly for restraint.

| Role | Size / line-height | Weight | Tracking | Family |
|---|---|---|---|---|
| `page-title` | 26 / 32 | 600 | −0.015em | Inter |
| `h1` | 20 / 28 | 600 | −0.01em | Inter |
| `body-lg` (citizen default; **16px is a hard floor**) | 16 / 24 | 400 | 0 | Inter |
| `body` (secondary/meta) | 15 / 22 | 400 | 0 | Inter |
| `label` | 12 / 16 | 500 | +0.04em, uppercase | Inter |
| `data` | 13 / 18 | 400, `tabular-nums` | 0 | **Geist Mono** |

**Why the 16px floor is non-negotiable, restated:** below it, iOS Safari zooms the viewport on input focus — disorienting for someone standing outdoors, one-handed, trying to report a flood. This is a correctness requirement, not a style preference, and nothing about a visual refresh changes it.

**Why Geist Mono, not a "Linear-style" mono:** Linear uses its own custom monospace face; PORAC does not need a fourth font load to imitate that. Geist Mono is already loaded via `next/font/google` today, already wired into `--font-mono`, and already used correctly for every machine-produced value in the app. Swapping it for a different mono would cost a font load and buy nothing — ponytail rule applies here as much as anywhere: don't reinvent what already works.

---

## 4. Color tokens

**Do not present any of the following as official Municipality of Porac branding.** These are original, product-owned accents chosen for semantic fit (institutional blue, terrain green, waterway cyan, lahar ochre) — they are not sourced from, and should not be described as, an official LGU visual identity unless that is separately verified with the municipality.

Hex is canonical, as in v1; `oklch` is a reference for reasoning about hue separation, not a value to transcribe literally.

### 4.1 Neutrals — Citizen shell (light, `:root` default)

| Token | Hex | Use |
|---|---|---|
| `--color-canvas` | `#F7F9FB` | Page background |
| `--color-surface` | `#FFFFFF` | Cards, inputs, table body |
| `--color-surface-elevated` | `#FBFCFD` | Popovers, sheets, dropdowns — one step "up" from `surface` without needing a shadow to read as lifted |
| `--color-border` | `#E1E6EB` | Card/input borders |
| `--color-border-subtle` | `#EDF0F3` | Row dividers, hairlines |
| `--color-ink-primary` | `#2E3841` | Body text |
| `--color-ink-secondary` | `#5A6672` | Secondary text, table headers |
| `--color-ink-tertiary` | `#808C99` | Meta, timestamps, placeholders |
| `--color-ink-heading` | `#10151A` | Headings |

*(Identical to v1's `--color-canvas/surface/line-100/line-200/ink-400/500/700/900` — only the names are normalized to a `border`/`ink-{primary,secondary,tertiary,heading}` convention so the admin override in §4.2 can reuse the same names. No citizen-visible value actually changes.)*

### 4.2 Neutrals — Admin shell (dark, `[data-shell="admin"]` override)

A blue-tinted near-black, not a pure `#000` — Linear's own dark surfaces avoid true black for the same reason (pure black next to white text creates more perceived glare, not less).

| Token | Hex | Use |
|---|---|---|
| `--color-canvas` | `#0E1116` | Page background |
| `--color-surface` | `#14171D` | Sidebar, table body, panel fill |
| `--color-surface-elevated` | `#1B1F27` | Popovers, sheets, dropdowns, dialogs |
| `--color-border` | `#262B33` | Panel borders, input borders |
| `--color-border-subtle` | `#1E222A` | Row dividers — barely visible, Linear-like hairline weight |
| `--color-ink-primary` | `#E6E9EE` | Body text (off-white, not pure white — reduces glare) |
| `--color-ink-secondary` | `#9AA3AF` | Secondary text, table headers |
| `--color-ink-tertiary` | `#6B7280` | Meta, placeholders, disabled |
| `--color-ink-heading` | `#F5F7FA` | Headings |

### 4.3 Municipal accent (brand) — shared hue, shell-tuned lightness

Deliberately kept in the same institutional-blue hue family as v1 (~220–250°) rather than drifting toward Linear's own indigo/violet (~255–265°) — this is the explicit "don't copy Linear's brand identity" decision made concrete. Same reasoning as v1: maximum hue distance from the warm urgency ramp.

| Token | Hex | Shell | Use |
|---|---|---|---|
| `--color-brand-50` | `#EFF5FC` | Citizen | Subtle fills, Under Review pill |
| `--color-brand-100` | `#D8E6F7` | Citizen | Selected row, active chip |
| `--color-brand-300` | `#8FB6DE` | Citizen | Decomposition bar segment |
| `--color-brand-500` | `#2B6CB0` | Citizen | Primary button, link, focus ring |
| `--color-brand-600` | `#22578E` | Citizen | Hover/active |
| `--color-brand-700` | `#1A4570` | Citizen | Nav accents, heading emphasis |
| `--color-brand-900` | `#102943` | Citizen | Deepest text on brand tints |
| `--color-brand-400` | `#5B9BE0` | **Admin** | Primary accent on dark surfaces — lighter tint of the same hue, tuned for ≥4.5:1 against `#0E1116`/`#14171D` |
| `--color-brand-300-dark` | `#3E6E9E` | **Admin** | Hover/pressed state on dark surfaces |

### 4.4 Urgency ramp (`urgency_band`) — concept unchanged, dark-safe variant added

Applies to `urgency_band` only, exactly as in v1: `< 0.40` Low · `0.40–0.70` Medium · `> 0.70` Critical. Same asymmetry rule as v1: **Low and Medium stay tinted, Critical stays solid** — in a 40-row queue, three equal pastels give every row the same visual weight; Critical needs to win the scan.

**Citizen / light (unchanged from v1):**

| Band | Solid | Tint | Ink | Edge |
|---|---|---|---|---|
| Low | `#D99A00` | `#FDF3D7` | `#6B4A00` | `#EFD79A` |
| Medium | `#E2680E` | `#FDE7D3` | `#8A3A00` | `#F5C09A` |
| Critical | `#C42B1C` (white text) | — | — | — |

**Admin / dark (new — same hue anchors, re-lit for a dark canvas):**

| Band | Solid | Tint | Ink | Edge |
|---|---|---|---|---|
| Low | `#E3A825` | `#2B2412` | `#F2D98A` | `#4A3D1A` |
| Medium | `#E8763A` | `#2E1F14` | `#F5B98A` | `#4D3120` |
| Critical | `#E5453A` (white text) | — | — | — |

Band names are always spelled out in text (never color-only), and map pins keep encoding band redundantly via size + ring weight — both unchanged from v1, both still required for colorblind users under a warm-only ramp.

### 4.5 Status progression (`ticket_status`) — concept unchanged, dark-safe variant added

Still a cool progression reusing the brand ramp exactly (Under Review / In Progress = brand tokens verbatim), still never a saturated brand fill (so a pill is never mistaken for a button), still switching to a cool green for Resolved so "done" never reads as "low urgency."

**Citizen / light (unchanged):** Reported `#F1F3F5`/`#434B54`/`#98A2AC` · Under Review `brand-50`/`brand-700`/`brand-500` · In Progress `brand-100`/`brand-900`/`brand-600` · Resolved `#E3F5EE`/`#0B5741`/`#0F7A5A`.

**Admin / dark (new):** Reported `#1C1F24`/`#9AA3AF`/`#5B6472` · Under Review `#17232E`/`#8FBEEA`/`brand-400` · In Progress `#1B2E42`/`#BFDCF5`/`#3E6E9E` · Resolved `#12291F`/`#5FCBA0`/`#2FA579`.

### 4.6 Integrity / moderation flags — retained exactly, no changes

Covers `LOCATION_MISMATCH`, `STALE_PHOTO`, `NO_EXIF`, `DUPLICATE_IMAGE`, `BOUNDARY_FALLBACK`. Violet (~300°) stays isolated from brand, urgency, and status in both shells — this was already correct in v1 and needed no redesign.

| Token | Light (citizen) | Dark (admin) |
|---|---|---|
| `--color-flag` | `#7B2FA8` | `#B285D6` |
| `--color-flag-tint` | `#F3E8FB` | `#241A2E` |
| `--color-flag-ink` | `#5B2178` | `#D9BCEE` |
| `--color-flag-edge` | `#DDBDF0` | `#3D2A4A` |

### 4.7 Map accent colors — new, map-only, never UI chrome

Three original accents for Leaflet layers (admin `/admin/map`, citizen `/map`), each chosen for domain fit to Porac's actual hazard geography (near Mt. Pinatubo — lahar and terrain are not decorative color choices, they're the literal subject matter of two report categories). **These never appear as buttons, badges, or any interactive chrome** — same one-meaning-per-channel rule as urgency/status/flags, just extended to three new channels.

| Token | Hex | Use |
|---|---|---|
| `--color-terrain` | `#6B8F5A` | Elevation/contour shading, terrain-type overlay |
| `--color-terrain-tint` | `rgba(107,143,90,0.15)` | Low-opacity choropleth fill |
| `--color-waterway` | `#2E8DA8` | Rivers, flood-prone-zone overlay (kept ~30° away from municipal blue's hue so the two are never confused on the same map) |
| `--color-lahar` | `#8A6A4A` | Lahar/earth-material terrain layer — deliberately desaturated and shifted brown-warm relative to urgency-low's saturated amber, so the two never collide even though both sit in a similar hue neighborhood |
| `--color-infra-safety` | `#C9A227` | Infrastructure-hazard iconography only (exposed wiring, damaged guardrail) in map legends — never a UI color |

### 4.8 Focus and selection

| State | Citizen | Admin |
|---|---|---|
| Focus ring | `2px solid var(--color-brand-500)`, `outline-offset: 2px` | `2px solid var(--color-brand-400)`, `outline-offset: 2px` |
| Active nav item | n/a (no persistent nav rail on citizen) | Full-fill `--color-surface-elevated` background + `--color-ink-heading` text + medium weight. **No side-stripe border** — this is the direct fix for `AdminSidebar.tsx`'s current `border-l-2 border-indigo-500` pattern. |
| Selected table row | `--color-brand-50` background | `--color-brand-400` at ~12% opacity background |
| Hover row | `--color-canvas` (unchanged reasoning from v1: must never equal the Under-Review pill's tint) | `--color-surface-elevated` |

---

## 5. Admin shell specification

- **Fixed dark theme**, via `[data-shell="admin"]` on the root layout wrapper (§2) — not a toggle, not `prefers-color-scheme`.
- **Sidebar**: recommend migrating `AdminSidebar.tsx` onto shadcn's `Sidebar` primitive (§6) rather than continuing to hand-roll the mobile-drawer/collapse logic it currently reimplements. Compact — same icon+label density as today, same two-section grouping (Main Workspace / Moderation), but:
  - Active item = full fill, not a side stripe (§4.8).
  - Sidebar surface = `--color-surface` (`#14171D`), not `slate-950`.
  - No `indigo-500` anywhere — office badge and active states use `brand-400`.
- **Headers/toolbars**: flat `--color-surface` + `1px --color-border` bottom border. No `backdrop-blur`, no translucent background, anywhere.
- **Tables**: dense, 36–40px row height (tightened from the 44px — `h-11` — currently in `TicketsWorkspace.tsx`), `13px`/`body` text, sticky header, `--color-border-subtle` row dividers, no zebra striping (unchanged reasoning from v1 — alternating fills compete with urgency badges).
- **Cards/panels**: `--color-surface` fill, `1px --color-border`, radius `md` (§7), **no shadow** except where a layer is genuinely floating (dropdown, popover, dialog).
- **Map-first surfaces** (`/admin/map`, dashboard's mini-map): the map is the primary content, not a card *inside* a card — no nested chrome around the Leaflet container beyond a single `1px` border.
- **KPI tiles** (dashboard): flat `--color-surface` + `1px --color-border`, radius `md`, **no glass, no shadow** — this is the direct replacement for `GLASS_CARD`.

## 6. Citizen shell specification

- **Fixed light theme** (the `@theme` default — no override needed).
- **Mobile-first**: unchanged from v1 — 44×44px minimum touch targets, 48px inputs/buttons, 16px input floor (§3.4), labels above inputs.
- **Prominent report action**: the "Report Hazard" / "Report New Hazard" CTA stays the one saturated `brand-500` fill on every citizen surface that offers it — the single highest-priority action available to a citizen, and it should read as the only truly "loud" element on the page.
- **Progress tracking**: the existing `ProgressSteps` component (`app/(citizen)/reports/page.tsx`) is already correctly tokenized and matches this system's intent (brand-filled reached steps, neutral future steps) — retained as-is, no redesign needed.
- **Outdoor readability**: body text stays `--color-ink-primary` (`#2E3841`) against `--color-canvas` (`#F7F9FB`) or `--color-surface` (`#FFFFFF`) — both pairs already clear WCAG AA and were verified fine in v1; no change.
- **Shared identity without shared density**: citizen surfaces use the *same* brand blue, the *same* urgency/status/flag semantics, and the *same* Inter/Geist Mono pairing as admin — just at citizen's own generous spacing/radius scale (§7), never admin's dense one.

---

## 7. Spacing, radius, shadow

**Spacing scale (unchanged from v1, still correct):** 2, 4, 6, 8, 12, 16, 20, 24, 32, 40, 48, 64.

**Radius — now split per shell, deliberately tighter than the `rounded-xl` (12px) currently used by the glass cards:**

| Token | Admin | Citizen |
|---|---|---|
| `sm` (badges, chips) | 3px | 6px |
| `md` (buttons, inputs, panels) | 4px | 8px |
| `lg` (larger panels, photo cards) | 6px | 10px |
| `full` (pills, dots, avatars) | 9999px | 9999px |

**Shadows:**
- Admin: none by default. The only shadow tokens are the ones shadcn ships for genuinely floating layers (`DropdownMenu`, `Sheet`, `Dialog`, `Tooltip`) — left at shadcn's default `shadow-md`/`shadow-lg`, not customized further.
- Citizen: a single subtle `shadow-sm` on hover for report cards (already the existing behavior in `app/(citizen)/reports/page.tsx` — retained, not new).

**Panel hierarchy (both shells):** `canvas` (page) → `surface` (content panel) → `surface-elevated` (anything that visually floats above the panel: popover, sheet, dialog, dropdown). Never more than these three steps — a fourth level of nested elevation is itself the "decorative card" anti-pattern.

**Icon sizes:** 16px inline with text (nav labels, buttons), 18–20px standalone (sidebar icons, empty-state icons), 40px only for large empty-state illustrations (citizen "no reports yet" pattern, unchanged from current implementation). Lucide, `strokeWidth: 1.75` — matches the current `AdminSidebar.tsx` convention, kept as the system default rather than introducing a second icon weight.

---

## 8. Component principles (shadcn/ui)

Applies to the primitives already installed (`Button`, `Badge`, `Separator`, `Tooltip`, `Sheet`, `DropdownMenu`) plus the ones named in this phase's brief. **No implementation in this pass** — these are the rules the next implementation phase follows.

| Component | Customize | Keep close to shadcn default |
|---|---|---|
| **Button** | Variant colors repointed at `--color-brand-*` per shell; radius per §7's shell scale. | Size scale, focus-ring mechanics, `asChild`/`Slot` pattern — already solid. |
| **Badge** | Heavily — this is where urgency/status/flag chips live. Replace/extend shadcn's generic `default`/`secondary`/`destructive`/`outline` variants with semantic variants (`urgency-low`, `urgency-medium`, `urgency-critical`, `status-reported`, `status-under-review`, `status-in-progress`, `status-resolved`, `flag`) driven by the token table in §4, not shadcn's default palette. | Component structure/sizing. |
| **Sheet** | Surface color → `--color-surface-elevated` per shell. | Everything else — used for the mobile admin nav drawer today and is a reasonable fit for future citizen mobile filters. |
| **DropdownMenu** | Colors → tokens. First real usage: replacing the raw `<select>` filter controls in `TicketsWorkspace.tsx`'s toolbar. | Structure/interaction — shadcn's keyboard nav and positioning are already correct, no reason to touch them. |
| **Tooltip** | Nothing structural. | Everything — used sparingly (office-code abbreviations, truncated mono IDs). Needs a `TooltipProvider` wrap at the relevant layout root the first time it's actually used (not yet). |
| **Sidebar** *(not yet installed)* | Heavy retokenization: dark-shell colors, full-fill active state instead of side-stripe, same two-section grouping `AdminSidebar.tsx` already has. Recommended as the replacement for the hand-rolled sidebar — it already solves collapsible/mobile-drawer/keyboard nav that `AdminSidebar.tsx` currently reimplements by hand. | Collapse/keyboard-nav mechanics. |
| **Table** *(not yet installed)* | Row height, text size, divider color, sticky-header behavior tuned to §5's density spec. Recommended as the replacement for `TicketsWorkspace.tsx`'s raw `<table>`. | Structural markup (`<Table>`, `<TableHeader>`, `<TableRow>`, etc.) — no reason to hand-roll what shadcn already provides correctly. |
| **Tabs** *(not yet installed)* | Active-indicator color → `brand-400`/`brand-500` per shell. Recommended for ticket detail (`Overview` / `Priority breakdown` / `Member reports`) instead of one long scroll. | Everything else. |
| **Dialog** *(not yet installed)* | Surface/overlay color per shell. Recommended for status-change and office-reassignment confirmations. | Everything else. |
| **Command** *(not yet installed)* | Minimal — surface color only. Recommended for a future admin ⌘K ticket-search/jump palette; genuinely Linear-inspired, but **defer** — not urgent, no current entry point needs it yet. | Nearly everything — Command's UX conventions (fuzzy search, keyboard-first) are well-established; users expect them unmodified. |
| **Breadcrumb** *(not yet installed)* | Mono styling for the ticket-ID segment (`Tickets / #1234`). | Everything else. |
| **Skeleton** *(not yet installed)* | Nothing — `--color-border-subtle`/`--color-line-100` pulse color already matches. Recommended as a direct replacement for `TicketsWorkspace.tsx`'s hand-rolled `animate-pulse` skeleton rows. | Everything. |
| **Alert** *(not yet installed)* | Variant colors → flag/urgency tokens depending on context (flagged-report review banners, form validation summaries). | Structure. |
| **Toast / Sonner** *(not yet installed — justified)* | **Yes, add it.** There is currently no toast/notification system anywhere in the app (`sonner` is not a dependency) — status-change confirmations, CSV export completion, and citizen submission confirmation all currently have no acknowledgment UI at all. Style dark for admin / light for citizen; position bottom-right admin (desk use, won't obscure the pointer), bottom-center citizen (thumb reach). | Timing/dismissal behavior — shadcn's Sonner defaults are fine. |

---

## 9. Example page anatomy

**Admin — Ticket Queue (`/admin/tickets`), after migration:**

```
┌ Sidebar (dark, fixed) ─┬─────────────────────────────────────────────┐
│ PORAC-SDSS             │ Ticket Queue                    [Export ▾] │
│ ─────────────────      │ ┌───────────────────────────────────────┐ │
│ MAIN WORKSPACE          │ │ Search…  Office▾  Status▾  Barangay▾  │ │  ← flat toolbar,
│ ▪ Dashboard             │ └───────────────────────────────────────┘ │    no glass
│ ▪ Ticket Queue  ← full  │ ┌───────────────────────────────────────┐ │
│   fill, no stripe       │ │ ID    Category   Barangay   Urgency   │ │  ← 36–40px rows,
│ ▪ Interactive Map       │ │ #142  Flooding   Sta Rita   ▓92 Crit  │ │    sticky header,
│                         │ │ #139  Roads      Poblacion  ░64 Med   │ │    no zebra
│ MODERATION              │ │ ...                                    │ │
│ ▪ Flagged Reports       │ └───────────────────────────────────────┘ │
│                         │                                           │
│ MEO Administrator       │                                           │
└─────────────────────────┴─────────────────────────────────────────┘
```

**Citizen — My Reports (`/reports`), unchanged structure, retokenized only:**

```
┌ Header (light, brand wordmark + nav) ───────────────────────────────┐
│                                                                       │
│  Citizen Portal                              [ + Report New Hazard ]│
│  My Reports                                                          │
│  Track the status of every hazard you submitted…                     │
│                                                                       │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐                        │
│  │ Total  │ │ Active │ │Resolved│ │Critical│   ← stat tiles, tokens  │
│  └────────┘ └────────┘ └────────┘ └────────┘     unchanged           │
│                                                                       │
│  ┌───────────────┐  ┌───────────────┐                                │
│  │ [photo]        │  │ [photo]        │                              │
│  │ Flooding Report │  │ Road Damage    │  ← existing card structure, │
│  │ ●───●───○───○  │  │ ●───●───●───●  │     retokenized only        │
│  │ [View] [Map]    │  │ [View] [Map]    │                             │
│  └───────────────┘  └───────────────┘                                │
└───────────────────────────────────────────────────────────────────┘
```

---

## 10. Anti-patterns (explicit bans)

- **Generic SaaS gradients.** No gradient fills, gradient text, or gradient accents anywhere.
- **Glassmorphism.** No `backdrop-blur` on any card, toolbar, or panel — this is the single highest-priority fix coming out of the audit (§0).
- **Excessive rounded cards.** No `rounded-xl`/`rounded-2xl` on functional chrome — see the tightened radius scale in §7.
- **Decorative icon boxes.** No icon-in-a-colored-square-tile pattern for stat tiles or nav items — icons sit inline with text, not inside their own chrome.
- **Oversized headings inside operational views.** Admin `page-title` tops out at 18px (§3.3) — a dashboard title should never out-compete the data below it.
- **Unnecessary animations.** Motion stays limited to 120ms color/opacity transitions on hover/focus, exactly as v1 specified. No entrance animations, no scroll-triggered effects, and every transition still wrapped in `prefers-reduced-motion`.
- **Excessive color.** Nine total hue families across the entire system (brand, urgency×1, status, flag, terrain, waterway, lahar, infra-safety, neutral) — no tenth hue gets added without removing one first.
- **Side-stripe borders as the sole active-state signal.** Banned outright (§4.8) — this is the direct fix for `AdminSidebar.tsx`'s current pattern.
- **Copying Linear's brand identity.** No indigo/violet hue family, no Linear wordmark styling, no 1:1 layout reproduction of Linear's own sidebar/issue-list chrome. The inspiration is the *design discipline* (density, restraint, precision), not the *look*.

---

## 11. Accessibility requirements

- WCAG AA minimum on every token pair in both shells (4.5:1 body text, 3:1 large text/UI) — the admin dark-palette pairs in §4.2–§4.6 are designed to clear this but, like v1's light pairs, **must be verified with an actual contrast checker during implementation**, not assumed from the design intent.
- `prefers-reduced-motion` respected everywhere, unchanged from v1.
- No dark-mode *toggle* — reaffirmed (§0). Each shell has exactly one theme.
- Urgency and lahar/earth colors both being warm-hued is a real risk under deuteranopia/protanopia — mitigated the same way v1 mitigated the urgency ramp itself: never rely on hue alone, always pair with a label, and keep lahar-earth strictly scoped to map terrain layers so it's never adjacent to an urgency badge in the same view.
- Citizen touch targets stay a hard 44×44px floor; citizen inputs stay a hard 16px floor — both unchanged, both correctness requirements, not style choices.

---

## 12. Responsive behavior

- Citizen: unchanged from current implementation — single-column mobile-first, `sm:`/`lg:` breakpoints widen to the existing grid layouts. No new breakpoints introduced by this redesign.
- Admin: sidebar collapses to a top bar + drawer below `md:` (unchanged behavior from today's `AdminSidebar.tsx`, just retokenized); tables gain horizontal scroll below the point where all columns no longer fit, rather than collapsing to cards (admin users benefit more from a scrollable dense table than a card-per-row mobile pattern — this is a desk tool first).

---

## 13. Empty / loading / error states

- **Empty**: existing citizen "No reports yet" pattern (large line-icon, message, CTA) is correctly designed already — retained as the template for any future empty state, admin included (e.g., "No tickets match this filter").
- **Loading**: replace `TicketsWorkspace.tsx`'s hand-rolled `animate-pulse` skeleton rows with shadcn's `Skeleton` component (§8) — same visual result, less bespoke code.
- **Error**: no dedicated error-state pattern exists yet in either shell. Recommend `Alert` (destructive variant, tokenized) for form-level errors and a simple centered message + retry action for full-page fetch failures — to be designed in detail during implementation, not this pass.

---

## 14. Migration phases

Ordered to fix the highest-audit-priority items first and to keep each phase independently shippable/testable.

**Phase 0 — Token layer.** Rewrite `app/globals.css`: new neutral/brand/urgency/status/flag/map-accent tokens (§4), `[data-shell="admin"]` override block, Inter font swap in `app/layout.tsx` (§3.2), retire the `GLASS_CARD`/`FLAT_CARD` constants in `DashboardClient.tsx`. Nothing else can be done cleanly before this.

**Phase 1 — Admin shell.** `AdminSidebar.tsx` → shadcn `Sidebar`, dark tokens, full-fill active state (no side stripe), `app/admin/layout.tsx`'s `data-shell="admin"` wrapper.

**Phase 2 — Ticket Queue.** `TicketsWorkspace.tsx` → shadcn `Table` + `DropdownMenu` filters + `Skeleton` loading rows; remove the glass toolbar.

**Phase 3 — Ticket Detail.** `Tabs` for Overview/Priority/Members; retokenize `TriagePanel.tsx`, `HorizontalStatusTracker.tsx`.

**Phase 4 — Dashboard.** De-glass all four KPI tiles in `DashboardClient.tsx`; flat bordered surfaces; keep the mini-map and leaderboard/category bars as-is structurally.

**Phase 5 — Map surfaces.** Add terrain/waterway/lahar/infra-safety accents to `admin/map` and citizen `/map` legends; retokenize `MapControls.tsx`, `TicketPopup.tsx`, `PublicTicketPopup.tsx`.

**Phase 6 — Citizen sweep + Toast.** Add `Sonner` (submission/status confirmations, both shells); minor radius tightening on citizen cards (12px → 10px per §7); verify `ReportForm.tsx`'s few raw-color spots are tokenized.

---

## 15. Files likely affected (by phase)

- **Phase 0**: `app/globals.css`, `app/layout.tsx`, `components.json` (no change expected, verify only)
- **Phase 1**: `components/layouts/AdminSidebar.tsx`, `app/admin/layout.tsx`
- **Phase 2**: `components/features/admin/tickets/TicketsWorkspace.tsx`
- **Phase 3**: `app/admin/tickets/[id]/page.tsx`, `components/features/admin/tickets/TriagePanel.tsx`, `components/features/admin/tickets/HorizontalStatusTracker.tsx`
- **Phase 4**: `components/features/admin/dashboard/DashboardClient.tsx`
- **Phase 5**: `components/features/admin/map/MapControls.tsx`, `components/features/admin/map/TicketPopup.tsx`, `components/features/citizen/map/PublicMapClient.tsx`, `components/features/citizen/map/PublicTicketPopup.tsx`
- **Phase 6**: new `components/ui/sonner.tsx` (shadcn add), `components/features/citizen/report/ReportForm.tsx`, `app/(citizen)/reports/page.tsx` (radius only)
- **Also touched somewhere in the sweep, lower priority**: `components/features/admin/flagged/KpiBar.tsx`, `components/features/admin/flagged/RiskMeter.tsx`, `components/features/admin/flagged/FlaggedWorkspace.tsx`, `components/features/admin/shared/OfficeScopeToggle.tsx`, `components/features/admin/auth/AdminLoginForm.tsx`, `components/features/admin/auth/SignOutButton.tsx`

## 16. Risks and test requirements

- **Contrast regression risk**: every new dark-shell token pair in §4.2–§4.6 is designed to clear AA but unverified by an actual tool — run a contrast checker against all pairs before Phase 1 ships, not after.
- **No visual-regression tooling exists today.** `e2e/smoke.spec.ts` asserts on visible text/roles, not computed styles or screenshots, so a full retheme is unlikely to break existing assertions — but it also means nothing will catch a color/contrast mistake automatically. Recommend either a lightweight Playwright screenshot baseline for the admin shell specifically, or careful manual QA per phase, before this ships further than Phase 1.
- **Font-swap layout shift**: verify via a production build (`pnpm build`) that swapping Geist Sans → Inter through `next/font/google` doesn't change bundle size or introduce CLS — check the Lighthouse/Next build output, not just visual inspection.
- **Standard checks per phase**: `tsc --noEmit`, `pnpm build`, `pnpm lint` (watching for new errors vs. the pre-existing ones already known from the shadcn-init pass), `pnpm exec playwright test` (requires the NestJS API running — see prior session notes) after every phase, not just at the end.
- **Do not implement components in this pass** — this document is the specification the next phase (Phase 0 above) implements against.
