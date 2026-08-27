# Restore Office Performance Summary and other orphaned Dashboard sections

**Labels:** `frontend`, `priority:p2`
**Type:** Bug fix (dead UI, not dead data)
**Priority:** P2 — highest operational value in the new frontend wave; zero backend work

## Background

`components/features/admin/dashboard/DashboardClient.tsx` (roughly lines 33–41) carries a comment stating that a prior redesign pass removed Office Performance Summary, Department Workload Comparison, category/status distribution charts, and Map Presets from the page composition — "their components/data remain intact, just unreachable from `/admin` until a future task gives them a home."

Verified by grep during the audit that produced this issue: `OfficePerformanceSummary.tsx`, `DepartmentWorkloadComparison.tsx`, `DistributionDonutChart.tsx`, `SeverityRadialChart.tsx`, and `MapPresets.tsx` (all in `components/features/admin/dashboard/`) are **never imported as components anywhere in `app/`** — only their TypeScript types are still referenced (`app/admin/page.tsx`, `app/admin/reports/page.tsx`) to type the `GET /admin/dashboard` response shape. The backend (`api/src/admin/dashboard.service.ts`/`.controller.ts`) still computes and returns every one of these fields on every single dashboard load.

## Problem

A system administrator currently has **no page anywhere in the app** showing an MEO vs. MDRRMO office performance comparison, despite the backend computing and returning `officePerformanceSummary`'s `byOffice` breakdown on every dashboard fetch. Department workload, category/status distribution, and Map Presets are similarly fully built, fully wired, and completely unreachable. This is dead UI sitting on top of live, already-fetched data — not a feature gap that needs new backend work.

## Operational / user value

Restores the only cross-office comparison view a system administrator has (a real decision-support capability, not decoration — it directly answers "is MEO or MDRRMO falling behind"). Restoring Map Presets also gives office-scoped MEO/MDRRMO admins one-click pre-filtered map links (e.g. "High-Urgency Open Work") they currently cannot reach at all.

## Scope

Give the orphaned sections a home on `/admin`, consistent with `docs/design-system.md` §5.8's gray-frame card treatment the page already uses correctly for its current sections (KPI row, incident chart, Needs Attention). Decide the exact placement (e.g. a second row below the current fold, or a clearly-labeled additional section) and implement it. **Do not change what data is computed** — this is a "make it reachable" pass, not a new-metric pass.

## File ownership

- `components/features/admin/dashboard/DashboardClient.tsx` (primary)
- `app/admin/page.tsx` — only if the fetch/props genuinely need adjusting (they shouldn't; the data is already fetched and typed)

## Files the other developer (Ian) should avoid while this is active

- `components/features/admin/dashboard/**`
- `app/admin/page.tsx`

## Reuse of existing data/API

`GET /admin/dashboard`'s existing `officePerformanceSummary` (including its system-admin-only `byOffice` comparison), `departmentWorkload`-equivalent field, category/status distribution fields, and `mapPresets` — all already fetched and typed in `DashboardClient.tsx`. Verify the exact field names against the current response type before wiring anything.

## Backend impact

None. No new endpoint, no new query, no new field.

## Dependencies

None — safe to start immediately, in parallel with #035 and #037.

## Acceptance criteria

- [ ] A system administrator sees an MEO vs. MDRRMO office performance comparison somewhere on `/admin`.
- [ ] Office-scoped MEO/MDRRMO admins do **not** see the cross-office comparison — they see only their own office's numbers, matching the existing backend scoping rule (`resolveOfficeScope`).
- [ ] Department Workload, category/status distribution, and Map Presets are all reachable again from `/admin`.
- [ ] The existing KPI row, incident chart, and Needs Attention section are visually and functionally unchanged.
- [ ] No new API call is added — the page still makes the same single `GET /admin/dashboard` request as before.
- [ ] Map Preset links land on genuinely pre-filtered `/admin/map` views (they already do — this is a "still true after restoring them" regression check, not new work).

## Validation

- `pnpm build`, `pnpm lint`.
- Manual check as a system administrator, as an MEO admin, and as an MDRRMO admin.
- Confirm no console error or layout shift from re-adding the sections.

## Out of scope

Adding any new metric or computation not already returned by `GET /admin/dashboard`, redesigning the KPI row or incident chart (unchanged), extracting a shared KPI/stat-card component (that's #035, already done by the time this starts if sequenced as recommended).

## Claude Code handoff prompt

```
Restore orphaned Dashboard sections in PORAC-SDSS. This is issue #036 — an
independent frontend task, safe to work in parallel with #035 and #037.

Read first: components/features/admin/dashboard/DashboardClient.tsx in full
(note its own comment, ~lines 33-41, naming exactly which sections were
removed from the page composition and why they're still "intact, just
unreachable"), components/features/admin/dashboard/OfficePerformanceSummary.tsx,
DepartmentWorkloadComparison.tsx, DistributionDonutChart.tsx,
SeverityRadialChart.tsx, MapPresets.tsx, api/src/admin/dashboard.service.ts and
dashboard.controller.ts (to confirm every field these components need is
already in the GET /admin/dashboard response), docs/design-system.md §5.8 (the
gray-frame card treatment this page already uses).

These five components are fully built and their backing data is already
computed and returned by the API on every dashboard load — verified via grep,
they are imported nowhere in app/ today, only their TYPES are still referenced.
Your job is to give them a home in DashboardClient.tsx's page composition, not
to build anything new.

Requirements:
- Restore Office Performance Summary (including its system-admin-only
  MEO/MDRRMO byOffice comparison), Department Workload Comparison, the
  category/status distribution chart(s), and Map Presets to the rendered page.
- Use the existing gray-frame CardBodyPanel/CardHeaderRow treatment this page
  already uses for its current sections — do not introduce a different card
  style.
- Do NOT add a new API call, a new field, or any new computation. If a
  component needs a field that genuinely isn't in the current response type,
  stop and report that rather than inventing a backend change.
- Confirm office scoping is preserved: only system admins see the byOffice
  comparison; MEO/MDRRMO admins see their own office's numbers only.
- Do not touch the existing KPI row, incident chart, or Needs Attention section.

Verify: pnpm build, pnpm lint, then manually load /admin as a system admin, an
MEO admin, and an MDRRMO admin and confirm the right sections appear for each,
with no console errors. Then git diff --check.
```
