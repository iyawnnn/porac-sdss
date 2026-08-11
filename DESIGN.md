# PORAC-SDSS Design System v3

Civic infrastructure reporting for the Municipality of Porac. Two audiences, one system: LGU staff (MEO / MDRRMO) working dense ticket queues for hours at a desk, and citizens filing hazard reports outdoors on a phone, often under stress.

> **Status: design specification / historical proposal, not the currently shipped authoritative UI.** v2 (Linear-inspired, all-dark admin shell) was implemented in the admin-shell-design-system commit and reverted the same day; v3 below (the navy-sidebar/yellow-accent direction, including the `[data-shell="admin"]` override mechanism) was never implemented at all. The shipped admin UI currently follows a different, light Efferd/shadcn-style workspace direction (see `app/globals.css`'s own architecture comment), not v2 or v3. Because a mechanism described here was built and then deliberately reverted, do not treat this file as the live source of truth for the admin shell without a new product decision to actually implement it. The rest of this document is kept as the design spec/proposal for reference.

Design direction: **Structural clarity in the register of shadcn's own dashboard patterns, not a reskin of any product's brand.** Deep municipal navy (chrome, not data), warm white and white content surfaces, and Porac Yellow as a restrained accent — not a dominant retail-yellow surface. PORAC keeps its own hue family and its own accent system.

---

## 0-A. v3 delta — why the dark shell was replaced

| v2 (dark, Linear-inspired) | v3 (light workspace, navy sidebar) | Why |
|---|---|---|
| Whole admin shell (canvas, surface, panels) rendered dark (`#0e1116`/`#14171d`). | Only the **sidebar** is dark (Deep Municipal Navy `#172554`); canvas/surface/panels are light (Warm White `#fafaf7`/white). | Feedback: the all-dark shell read as too small/muted for daily desk use, and didn't carry a distinct PORAC identity — a colored sidebar over a light workspace is a stronger, more legible identity move than a uniformly dark shell. |
| Admin type scale was restrained/dense (18px page title, 20px KPI number, 11px uppercase micro-labels). | Type scale is larger throughout (26px page title, 30–36px KPI number, 12–13px labels, no uppercase transform). | Same feedback — density was overcorrected; legibility at a glance matters more than fitting more on screen for a queue this size. |
| Admin brand accent was a lightened blue tint (`--color-brand-400 #5b9be0`) needed only because the canvas was dark. | Brand blue is unchanged from citizen's value (`#2b6cb0`) — no lightened variant needed once the canvas is light again. Porac Yellow (`#F5C518`) is the one new accent, used narrowly (sidebar focus ring, identity avatar) so it never reads as a yellow-dominant retail surface. | Restraint principle unchanged — one new accent, placed with intent, not sprinkled everywhere. |
| Navigation/heading copy was sentence case with tiny uppercase micro-labels (`ACTIVE HIGH PRIORITY`, `Main workspace`). | Title Case throughout, no uppercase-tracking micro-labels. | Explicit direction: uppercase micro-copy read as SaaS-dashboard cliché at this scale; Title Case reads as more institutional/considered. |
| Urgency/status/flag tokens needed dark-surface-safe variants under `[data-shell="admin"]`. | **Removed** — the admin canvas is light again, so these render identically to citizen's existing tokens. One less set of variants to keep in sync. | Direct consequence of going light — not a separate decision. |
| Dashboard: map + leaderboard + category in a left column, queue in a sticky right column — four panels of roughly equal visual weight. | Map promoted to one full-width **primary** panel; leaderboard/category/queue form a **secondary** row of three panels below it. | Explicit direction: "one primary workspace section," structurally inspired by shadcn's own dashboard composition (KPI row → one primary panel → supporting panels), without copying its content or branding. |

**A conflict this delta deliberately did not resolve by adopting a proposed swatch:** an earlier evaluation pass proposed a green-Low/amber-Medium/red-Critical urgency ramp. §4.4's existing amber→orange→red ramp is kept instead — green-for-Low was already rejected once (§0 below, and the original v1 audit) specifically because green reads as "fine/good," which is wrong for a queue where every row is an active hazard. Map accent hex values *were* refined in this pass (same hue families, better tuned against the new light canvas) since no such semantic conflict exists there.

---

## 0. Audit findings — what changed and why (v2, retained for history)

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

**v3 fallback stack.** `@theme inline`'s `--font-sans` appends an explicit system-ui fallback chain after the Inter variable: `var(--font-geist-sans), ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`. This is **not** a way of shipping SF Pro — no SF Pro (or any Apple system font) file is downloaded, bundled, or committed anywhere in this project. `-apple-system`/`system-ui` are OS-resolved keywords: on an Apple device with Inter somehow unavailable, the browser substitutes whatever system font it already has installed (typically San Francisco) entirely outside this app's control or distribution. The practical effect for everyone else is a graceful fallback to `ui-sans-serif`/`system-ui`, not a visual regression.

### 3.3 Type scale — Admin (v3: larger, Title Case, no uppercase micro-labels)

v2's dense/restrained admin scale (18px page-title, 11px uppercase labels) is superseded — it read as too small for daily desk use. v3 increases the scale across the board and drops the uppercase-tracking treatment entirely; labels are Title Case at a readable size instead.

| Role | Size / line-height | Weight | Tracking | Family |
|---|---|---|---|---|
| `page-title` | 26 / 32 | 600 | −0.01em | Inter |
| `section-heading` | 15–16 / 22–24 | 600 | −0.005em | Inter |
| `body` (admin default) | 14 / 20 | 400 | 0 | Inter |
| `body-emphasis` | 14 / 20 | 500 | 0 | Inter |
| `label` (table headers, KPI labels) | 12–13 / 16–18 | 500 | 0, **Title Case, no uppercase transform** | Inter |
| `data` (IDs, coords, timestamps, counts) | 12 / 16 | 400, `tabular-nums` | 0 | **Geist Mono** |
| `kpi-number` (dashboard KPI strip) | 30–36 / 36–40 | 600, `tabular-nums` | −0.01em | Inter (not mono — a KPI headline number is presentation, not a raw system value; see §3.4's data/mono distinction) |
| `score` (the one large urgency number, ticket detail only) | 28 / 32 | 600, `tabular-nums` | −0.01em | **Geist Mono** |

Navigation labels, section headings, KPI labels, and button/action text are all **Title Case** ("Ticket Queue," "Barangay Risk Leaderboard," "Export Summary (CSV)") — never uppercase-tracked micro-copy, and never all-lowercase sentence fragments for anything that functions as a label rather than a sentence.

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

### 4.2 Neutrals — Admin shell (v3: light workspace, `[data-shell="admin"]` override)

**Superseded from v2's dark palette.** The admin canvas is light again — Warm White, not near-black. The only deliberately dark surface in the admin shell now is the sidebar itself (§4.3-Sidebar below), which has its own separate token family and isn't part of this table.

| Token | Hex | Use |
|---|---|---|
| `--color-canvas` | `#FAFAF7` | Page background (Warm White) |
| `--color-surface` | `#FFFFFF` | Cards, table body, panel fill |
| `--color-surface-elevated` | `#FFFFFF` | Popovers, sheets, dropdowns, dialogs — same as `surface`; elevation reads via shadow, not a tone shift |
| `--color-border` | `#E5E7EB` | Panel borders, input borders |
| `--color-border-subtle` | `#F3F4F6` | Row dividers (Soft Gray) |
| `--color-ink-primary` | `#1F2937` | Body text (Charcoal) |
| `--color-ink-secondary` | `#667085` | Secondary text, table headers (Muted Text) |
| `--color-ink-tertiary` | `#98A2B3` | Meta, placeholders, disabled |
| `--color-ink-heading` | `#111827` | Headings |

### 4.3 Municipal accent (brand) and the navy sidebar

Brand blue is unchanged from citizen's value in both shells — the admin canvas is light again, so citizen's existing brand ramp already has correct contrast; **no lightened dark-surface variant is needed** (v2's `--color-brand-400`/`--color-brand-300-dark` are removed).

| Token | Hex | Shell | Use |
|---|---|---|---|
| `--color-brand-50` | `#EFF5FC` | Both | Subtle fills, Under Review pill |
| `--color-brand-100` | `#D8E6F7` | Both | Selected row, active chip |
| `--color-brand-300` | `#8FB6DE` | Both | Decomposition bar segment |
| `--color-brand-500` | `#2B6CB0` | Both | Primary button, link, focus ring |
| `--color-brand-600` | `#22578E` | Both | Hover/active |
| `--color-brand-700` | `#1A4570` | Both | Nav accents, heading emphasis |
| `--color-brand-900` | `#102943` | Both | Deepest text on brand tints |

**The sidebar — Deep Municipal Navy, the one deliberately dark surface.** Uses shadcn's own `--sidebar*` token family (separate from the tokens above, so the sidebar can be dark while the content area is light without a second override layer):

| Token | Hex | Use |
|---|---|---|
| `--sidebar` | `#172554` | Sidebar background (Deep Municipal Navy) |
| `--sidebar-foreground` | `#F8FAFC` | Nav labels, body text on navy |
| `--sidebar-primary` | `#F5C518` | Porac Yellow — identity avatar fill only, restrained |
| `--sidebar-primary-foreground` | `#172554` | Navy text on the yellow avatar fill |
| `--sidebar-accent` | `#1E3A6E` | Active nav item fill — full-fill, never a side-stripe (§10) |
| `--sidebar-accent-foreground` | `#FFFFFF` | Active nav item text — "clear white active state" |
| `--sidebar-border` | `#24407A` | Hairline dividers within the sidebar |
| `--sidebar-ring` | `#F5C518` | Porac Yellow — keyboard focus ring on nav items only |

**Why yellow appears in exactly two places (focus ring, avatar fill) and nowhere else:** the brief explicitly warns against "the retail/promotional feel of a yellow-dominant website." A functional focus ring only shows up when a keyboard user is actually tabbing through nav, and an avatar fill is a small, contained identity marker — both read as intentional accents rather than a yellow-branded surface. Buttons, links, and primary actions stay brand blue (`--primary` in §4.2's shadcn mapping) specifically so the workspace doesn't tip into "yellow website."

### 4.4 Urgency ramp (`urgency_band`) — unchanged in v3, no shell variant needed

Applies to `urgency_band` only: `< 0.40` Low · `0.40–0.70` Medium · `> 0.70` Critical. **Same asymmetry rule as always: Low and Medium stay tinted, Critical stays solid** — in a 40-row queue, three equal pastels give every row the same visual weight; Critical needs to win the scan.

| Band | Solid | Tint | Ink | Edge |
|---|---|---|---|---|
| Low | `#D99A00` | `#FDF3D7` | `#6B4A00` | `#EFD79A` |
| Medium | `#E2680E` | `#FDE7D3` | `#8A3A00` | `#F5C09A` |
| Critical | `#C42B1C` (white text) | — | — | — |

**A green-Low/amber-Medium/red-Critical alternative was evaluated for v3 and rejected** — green reads as "fine/good," which is the wrong signal for a queue where every row is an active hazard (this exact reasoning is why the original ramp was warm-only from the start). Since the admin canvas is light again, v2's dark-surface-safe urgency variant is also no longer needed — one ramp, both shells.

Band names are always spelled out in text (never color-only), and map pins keep encoding band redundantly via size + ring weight.

### 4.5 Status progression (`ticket_status`) — unchanged in v3, no shell variant needed

Still a cool progression reusing the brand ramp exactly (Under Review / In Progress = brand tokens verbatim), still never a saturated brand fill (so a pill is never mistaken for a button), still switching to a cool green for Resolved so "done" never reads as "low urgency." One set of values, both shells: Reported `#F1F3F5`/`#434B54`/`#98A2AC` · Under Review `brand-50`/`brand-700`/`brand-500` · In Progress `brand-100`/`brand-900`/`brand-600` · Resolved `#E3F5EE`/`#0B5741`/`#0F7A5A`.

### 4.6 Integrity / moderation flags — retained exactly, no changes

Covers `LOCATION_MISMATCH`, `STALE_PHOTO`, `NO_EXIF`, `DUPLICATE_IMAGE`, `BOUNDARY_FALLBACK`. Violet (~300°) stays isolated from brand, urgency, and status. One set of values, both shells (no shell variant needed now that admin's canvas is light): `--color-flag` `#7B2FA8` · `--color-flag-tint` `#F3E8FB` · `--color-flag-ink` `#5B2178` · `--color-flag-edge` `#DDBDF0`.

### 4.7 Map accent colors — refined hex, same hue families, map-only, never UI chrome

Three original accents for Leaflet layers (admin `/admin/map`, citizen `/map`), each chosen for domain fit to Porac's actual hazard geography (near Mt. Pinatubo — lahar and terrain are not decorative color choices, they're the literal subject matter of two report categories). **These never appear as buttons, badges, or any interactive chrome** — same one-meaning-per-channel rule as urgency/status/flags, just extended to three new channels.

| Token | Hex | Use |
|---|---|---|
| `--color-terrain` | `#5F7F63` | Elevation/contour shading, terrain-type overlay |
| `--color-terrain-tint` | `rgba(95,127,99,0.15)` | Low-opacity choropleth fill |
| `--color-waterway` | `#3B82A0` | Rivers, flood-prone-zone overlay (kept ~30° away from municipal blue's hue so the two are never confused on the same map) |
| `--color-lahar` | `#9A6A3A` | Lahar/earth-material terrain layer — deliberately desaturated and shifted brown-warm relative to urgency-low's saturated amber, so the two never collide even though both sit in a similar hue neighborhood |
| `--color-infra-safety` | `#D99A22` | Infrastructure-hazard iconography only (exposed wiring, damaged guardrail) in map legends — never a UI color |

### 4.8 Focus and selection

| State | Citizen | Admin content area | Admin sidebar |
|---|---|---|---|
| Focus ring | `2px solid var(--color-brand-500)`, `outline-offset: 2px` | Same — `--color-brand-500` unchanged (§4.3) | `--sidebar-ring` (Porac Yellow `#F5C518`) — the one place yellow shows up as a functional accent (§4.3) |
| Active nav item | n/a (no persistent nav rail on citizen) | n/a | Full-fill `--sidebar-accent` background + `--sidebar-accent-foreground` (white) text + medium weight. **No side-stripe border.** |
| Selected table row | `--color-brand-50` background | `--color-brand-50` background (same as citizen — light canvas again) | n/a |
| Hover row | `--color-canvas` (must never equal the Under-Review pill's tint) | `--color-canvas` (same reasoning) | `--sidebar-accent` at reduced opacity |

---

## 5. Admin shell specification

- **Light operational workspace with a navy sidebar** (v3; supersedes v2's fixed-dark shell), via `[data-shell="admin"]` on the root layout wrapper (§2) — not a toggle, not `prefers-color-scheme`. The sidebar is the one deliberately dark/colored surface; canvas, panels, and tables are light.
- **Sidebar**: shadcn's `Sidebar` primitive, Deep Municipal Navy background (§4.3), same two-section grouping (Main Workspace / Moderation), Title Case labels (§3.3, no uppercase transform).
  - Active item = full fill on `--sidebar-accent`, white text, not a side stripe (§4.8).
  - No `slate`/`indigo` anywhere — the sidebar's own token family (`--sidebar*`) drives every color.
  - Porac Yellow appears exactly twice: the keyboard focus ring (`--sidebar-ring`) and the identity avatar fill (`--sidebar-primary`) — restrained by design (§4.3).
- **Headers/toolbars**: flat `--color-surface` (white) + `1px --color-border` bottom border. No `backdrop-blur`, no translucent background, anywhere.
- **Tables**: dense, 36–40px row height, `14px`/`body` text (v3 scale, §3.3), sticky header, `--color-border-subtle` row dividers, no zebra striping (alternating fills compete with urgency badges).
- **Cards/panels**: `--color-surface` (white) fill, `1px --color-border`, radius `md` (§7), **no shadow** except where a layer is genuinely floating (dropdown, popover, dialog).
- **Map-first surfaces** (`/admin/map`, dashboard's mini-map): the map is the primary content, not a card *inside* a card — no nested chrome around the Leaflet container beyond a single `1px` border.
- **KPI tiles** (dashboard): flat white `--color-surface` + `1px --color-border`, radius `md`, **larger numbers** (30–36px, §3.3) — no glass, no shadow.
- **Dashboard composition** (v3): KPI row → **one** full-width primary panel (the map) → a secondary row of supporting panels (leaderboard, category, urgency queue), rather than several equal-weight panels beside the map. Structurally inspired by shadcn's own dashboard composition pattern — content, branding, and exact styling are PORAC's own, not copied.

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
| **Tabs** *(not yet installed)* | Active-indicator color → `brand-500` (one value, both shells — no shell-specific variant needed since v3). Recommended for ticket detail (`Overview` / `Priority breakdown` / `Member reports`) instead of one long scroll. | Everything else. |
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
