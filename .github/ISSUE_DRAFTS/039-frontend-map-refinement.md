# Align Interactive Map legend and marker colors to the token system

**Labels:** `frontend`, `priority:p3`
**Type:** Chore (maintainability / consistency, low operational urgency)
**Priority:** P3 — lower priority / optional. Do this last of the workspace-level issues, only if bandwidth allows.

## Background

`docs/design-system.md` §5 bans glassmorphism on map panels/popups/controls and §9 separately flags the map as the "highest Leaflet risk" surface in the whole redesign, sequenced deliberately late (Phase 5) for that reason. `docs/design-system.md` §6's "Map panels, popups, controls" rule requires flat `surface` + 1px `border` + `shadow-md`, and its rule on Leaflet hex mirrors: **"the only permitted hex literals are Leaflet `divIcon` mirrors, which must be generated from the token source rather than maintained by hand."**

The audit that produced this issue checked `MapFilterBar.tsx`, `MapLegend.tsx`, and `MapControls.tsx` and found them **already compliant** — flat cards, no `backdrop-blur`, already using token-driven urgency-band colors (`getUrgencyBandStyle`) rather than hardcoded hex. The remaining risk is narrower than the design system's own framing suggests: it's scoped to `MapClient.tsx`'s marker `divIcon` inline styles and the heatmap gradient, which is where a hand-maintained hex value could actually drift from the token source.

## Problem

Marker and heatmap colors are Leaflet `divIcon` inline styles, which cannot read CSS custom properties directly the way the rest of the app does — if they're hand-typed hex values today, they're exactly the kind of duplicate-color-definition `docs/design-system.md` §7 calls an anti-pattern, and will silently drift the next time an urgency-band token value changes anywhere else in the app.

## Operational / user value

Lower than #036/#037/#038 — this is closing a maintainability/drift risk, not fixing a workflow gap. Include it in this wave only if time allows; skipping it costs nothing operationally today.

## Scope

**Narrowly scoped — do not touch Leaflet layout, clustering, filter/legend/control chrome (already fine), or map interaction behavior.**

1. Confirm whether `MapClient.tsx`'s marker `divIcon` colors and the heatmap gradient are hardcoded hex or already derived from a shared source.
2. If hardcoded: generate them from the same token source `getUrgencyBandStyle`/`getUrgencyBadgeConfig` already use, rather than a second hand-maintained hex map.
3. If already derived from a shared source: this issue is a no-op — close it with a short note confirming that, rather than inventing work.

## File ownership

- `components/features/admin/map/MapClient.tsx` (marker/heatmap color derivation only)
- Possibly `lib/gis/*` if a shared color-derivation helper needs extracting

## Files the other developer (Ian) should avoid while this is active

- `components/features/admin/map/**`

## Reuse of existing data/API

`getUrgencyBandStyle`/`getUrgencyBadgeConfig` (`lib/utils/ui/urgency.ts` and/or `lib/utils/urgency.ts` — confirm which is the correct client-side source per `CLAUDE.md`'s note that `lib/utils/urgency.ts`/`scoring.ts` are deliberate client-side duplicates of the API's triage math, display-only).

## Backend impact

None.

## Dependencies

None, but recommended to sequence after #036/#038 land, since it's the lowest-priority item in this wave.

## Acceptance criteria

- [ ] Marker colors and the heatmap gradient still visually distinguish urgency bands exactly as before — no color changes the user would notice, only the source of truth changes.
- [ ] No hand-maintained hex literal duplicates a value already defined as a token elsewhere in the app.
- [ ] If the audit finds nothing to change, the PR says so explicitly and closes the issue with that finding rather than making a cosmetic change to justify itself.

## Validation

- `pnpm build`, `pnpm lint`.
- Manual visual check at 3 zoom levels (markers legible, heatmap gradient unchanged).
- `e2e/admin-map.spec.ts` (~16 tests) — run this file only, not the full suite.

## Out of scope

Any change to map filters, legend, or controls (already compliant — do not touch), Leaflet clustering/layout, the choropleth barangay boundary rendering, resolving `docs/design-system.md` §3.2's still-open Hazard Urgency palette TBD (that's a separate, larger design decision, not this issue).

## Claude Code handoff prompt

```
Audit and, if needed, fix marker/heatmap color derivation on PORAC-SDSS's
Interactive Map. This is issue #039 — lowest priority in the current frontend
wave, independent of #035-#038, safe to do last or skip if time-constrained.

Read first: components/features/admin/map/MapClient.tsx,
components/features/admin/map/MapLegend.tsx and MapFilterBar.tsx and
MapControls.tsx (already confirmed compliant with docs/design-system.md's
no-glass/flat-surface rule during the audit that created this issue — do NOT
change these three files), lib/utils/ui/urgency.ts and lib/utils/urgency.ts
(getUrgencyBandStyle/getUrgencyBadgeConfig - the token source), CLAUDE.md's
note on lib/ being a deliberate client-side duplicate of the API's triage math
for display only.

First, determine whether MapClient.tsx's Leaflet divIcon marker colors and the
heatmap gradient are hand-typed hex values or already derived from
getUrgencyBandStyle/getUrgencyBadgeConfig.

If they are hand-typed: change them to derive from the same token source those
two helpers already use, so there is exactly one urgency-color definition in
the codebase, not two that can drift apart. Leaflet divIcon styles cannot read
CSS custom properties directly, so this means importing/computing the hex
values from the shared JS source, not adding a CSS variable reference.

If they already derive from a shared source: make NO change. State that
explicitly in your summary and close the issue as a verified no-op — do not
invent a cosmetic change just to have something to ship.

Do NOT touch MapFilterBar.tsx, MapLegend.tsx, or MapControls.tsx (already
compliant), do not change any map filter/interaction behavior, do not touch
Leaflet clustering or the choropleth boundary layer, and do not attempt to
resolve docs/design-system.md §3.2's Hazard Urgency palette TBD — that is a
separate, larger, not-yet-approved decision.

Verify: pnpm build, pnpm lint, manual visual check of markers and heatmap at 3
zoom levels, then
pnpm exec playwright test e2e/admin-map.spec.ts -- --workers=1
Then git diff --check.
```
