# Add a shared admin KpiCard primitive and fix the AdminHeader route-label gap

**Labels:** `frontend`, `priority:p1`
**Type:** Chore (shared UI prerequisite)
**Priority:** P1 — this is the prerequisite for #037; nothing else in the new frontend wave should touch `components/features/admin/shared/**` or `components/layouts/AdminHeader.tsx` until this merges.

## Background

`docs/design-system.md` §6 calls for one shared KPI/stat-card component — "there are currently five near-identical copies." `KpiCard` is currently a private function inside `DashboardClient.tsx` (`components/features/admin/dashboard/DashboardClient.tsx`, roughly lines 178–202), not extracted.

Separately, `AdminHeader.tsx`'s `pageLabel()` (`components/layouts/AdminHeader.tsx`, lines 11–21) has no case for `/admin/work-orders` or `/admin/reports` — both fall through to the `"Dashboard"` default, so the breadcrumb on those two pages is wrong today. `docs/design-system.md` §9 already names this exact function as a known bug.

**Update (2026-08-27 documentation audit): item 3 of this issue's original scope — correcting `docs/design-system.md`'s stale "not yet implemented" status header — has already been done directly as part of a separate documentation-audit pass.** The status header and the §9 phase table now correctly state that Phase 0 (token foundation + admin shell) has shipped, citing `app/globals.css`'s brand-repoint block and `AdminSidebar.tsx`'s consumption of it. **Do not redo this** — this issue's remaining scope is just items 1 and 2 below (the `KpiCard` extraction and the `AdminHeader.pageLabel()` fix).

## Owner

**Ian.** No dependencies — this is the wave's own prerequisite. **Blocks #037**, which imports the extracted `KpiCard`.

## Problem

1. Any new page that wants a KPI tile (starting with #037) either hand-rolls a sixth near-duplicate or has to reach into `DashboardClient.tsx` for a private function.
2. Two real admin routes show the wrong breadcrumb label.
3. The design spec's own status framing risks misleading a future contributor into thinking no admin code has been touched yet, when the shell/dashboard token layer already has.

## Operational / user value

No end-user-visible workflow change on its own — this is foundational. Direct value: two currently-wrong breadcrumbs become correct, and #037 gets a clean KPI tile instead of a sixth copy.

## Scope

1. Extract `components/features/admin/shared/KpiCard.tsx` from `DashboardClient.tsx`'s existing private `KpiCard` implementation — same props, same rendering, **no visual change to the Dashboard**. Update `DashboardClient.tsx` to import it instead of defining it inline.
2. Add the two missing cases to `AdminHeader.tsx`'s `pageLabel()`: `/admin/work-orders` and `/admin/reports`. Match the exact label text `AdminSidebar.tsx` already uses for those two nav entries — do not invent new copy.
3. ~~Update `docs/design-system.md`'s status section...~~ **Already done** — see the update note above. No remaining work here.

## File ownership

- `components/features/admin/shared/KpiCard.tsx` (new)
- `components/features/admin/dashboard/DashboardClient.tsx` (import swap only)
- `components/layouts/AdminHeader.tsx`

## Files the other developer (Kian) should avoid while this is active

- `components/features/admin/shared/**`
- `components/layouts/AdminHeader.tsx`

(In practice #036 and #038 don't touch any of these, so this is a safety note, not an expected real conflict.)

## Reuse of existing data/API

None — pure frontend refactor. No new computation, no new fetch.

## Backend impact

None.

## Dependencies

None. This issue is itself the dependency for #037.

## Acceptance criteria

- [ ] Dashboard KPI row renders pixel-identical before and after the extraction.
- [ ] `/admin/work-orders` shows the correct breadcrumb label.
- [ ] `/admin/reports` shows the correct breadcrumb label.
- [ ] No other route's breadcrumb changes.
- [x] `docs/design-system.md`'s status framing accurately reflects that the admin shell/dashboard token layer has shipped — **already done**, not part of this issue's remaining work.
- [ ] `pnpm build` and `pnpm lint` pass.

## Validation

- `pnpm build`, `pnpm lint`.
- Manual check of every admin route's breadcrumb, not just the two fixed (regression check).
- Visual diff of the Dashboard KPI row before/after.

## Out of scope

Any visual redesign of the Dashboard KPI row itself (that's #036's territory if anything), a full rewrite of `docs/design-system.md`, resolving the §3.2 semantic-palette TBDs (Hazard Urgency/status/priority hues — separate, larger decision).

## Claude Code handoff prompt

```
Extract a shared KpiCard primitive and fix one bug in PORAC-SDSS's admin shell.
This is issue #035, the prerequisite for #037 — nothing else should build on
components/features/admin/shared/ until this merges.

NOTE: a separate documentation-audit pass already corrected
docs/design-system.md's stale "not yet implemented" status header and its §9
phase table. Do not redo that — it is no longer part of this issue's scope.

Read first: components/features/admin/dashboard/DashboardClient.tsx (the
existing private KpiCard function, ~lines 178-202), components/layouts/
AdminHeader.tsx (pageLabel(), lines 11-21), components/layouts/AdminSidebar.tsx
(for the exact label text of the Work Orders and Reports & Exports nav
entries).

Do exactly two things:
1. Extract components/features/admin/shared/KpiCard.tsx from DashboardClient's
   existing KpiCard function — same props, same rendering, NO visual change.
   Update DashboardClient.tsx to import it.
2. Add cases to AdminHeader.tsx's pageLabel() for /admin/work-orders and
   /admin/reports, using AdminSidebar.tsx's exact existing label text for each.

Do NOT change the Dashboard's visual output, do not touch any other route's
breadcrumb, do not touch docs/design-system.md (already corrected separately),
do not start any work that belongs to #036/#037/#038.

Verify: pnpm build, pnpm lint, then manually click through every admin sidebar
route and confirm each breadcrumb is correct (not just the two you fixed).
Then git diff --check.
```
