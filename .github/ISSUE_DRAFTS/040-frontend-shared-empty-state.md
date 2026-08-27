# Add a shared admin EmptyState component and migrate existing usages

**Labels:** `frontend`, `priority:p3`
**Type:** Chore (consolidation)
**Priority:** P3 — sequence last, after #036–#039 have all landed

## Background

`docs/design-system.md` §6 calls for one shared empty-state component: "20px muted icon, 14px `text-primary` title, 13px `text-muted` line, one optional action. There are currently eight variants across the two shells." The audit that produced this issue confirmed this is still true — `Notifications`, `Admin Management`, `Activity Log`, `Barangay Insights`, `Work Orders`, and others each hand-roll their own empty state today.

## Owner and sequencing

**Deliberately sequenced last, as a single-owner sweep — not parallel work.** This is the one issue in the wave that is genuinely cross-cutting: it touches files in both Ian's and Kian's territory (`work-orders/`, `dashboard/`, `barangay-insights/`, plus `notifications/`, `admins/`, `activity-log/`, `reports/`). Doing it before #036–#039 land would mean migrating call sites that are about to be rewritten anyway, and doing it in parallel with them would create merge conflicts in files another issue is actively restructuring. Whoever finishes their assigned issues first in this wave should take it.

## Problem

Eight-plus near-duplicate empty-state implementations mean inconsistent copy, icon sizing, and spacing across the admin shell, and a future change to the pattern (e.g. adding a secondary action slot) requires editing eight places instead of one.

## Operational / user value

Low on its own — this is a consolidation task the approved design spec explicitly asks for, not a new capability. Appropriate as a wave-closer, not a wave-opener.

## Scope

1. Extract `components/features/admin/shared/EmptyState.tsx` per `docs/design-system.md` §6's exact spec (20px muted icon, 14px title, 13px muted description line, one optional action slot).
2. Migrate every hand-rolled admin empty state to it — including any new ones introduced by #036, #037, #038, or #039 while they were in flight.
3. Do not change the *content* (copy/icon choice) of any existing empty state unless it's factually wrong — this is a component consolidation, not a copy rewrite.

## File ownership

- `components/features/admin/shared/EmptyState.tsx` (new)
- Every file across `components/features/admin/{dashboard,work-orders,barangay-insights,notifications,admins,activity-log,reports}/**` that currently hand-rolls an empty state.

## Files the other developer should avoid while this is active

None specifically reserved in advance — by the time this starts, #036–#039 have already merged, so there is no active concurrent work to collide with. The assigned developer should do a full sweep in one pass rather than incremental PRs, to avoid leaving some pages migrated and others not.

## Reuse of existing data/API

None — this is a pure UI component consolidation.

## Backend impact

None.

## Dependencies

**#036, #037, #038 must all be merged first** (#039 too, if it was taken on). This issue exists specifically to sweep up whatever those issues introduced.

## Acceptance criteria

- [ ] One `EmptyState` component definition exists.
- [ ] Every admin empty state — across Dashboard, Work Orders, Barangay Insights, Notifications, Admin Management, Activity Log, Reports & Exports, and any others found during the sweep — uses it.
- [ ] No visual regression to any migrated page's empty-state copy or icon (unless it was factually wrong, in which case the fix is noted in the PR).
- [ ] No page is left with a hand-rolled empty state after this merges.

## Validation

- `pnpm build`, `pnpm lint`.
- Manual check of every migrated page's empty state (e.g. a fresh office with zero tickets, zero work orders, zero notifications).

## Out of scope

Any change to loading-state (`Skeleton`) components — this issue is scoped to empty states only, per `docs/design-system.md` §6's separate "Loading states" rule.

## Claude Code handoff prompt

```
Extract and adopt a shared EmptyState component across PORAC-SDSS's admin
surfaces. This is issue #040, deliberately sequenced LAST — confirm #036,
#037, and #038 (and #039, if it was done) are already merged before starting,
since this issue exists specifically to sweep up whatever empty states those
introduced.

Read first: docs/design-system.md §6's "Empty states" spec (one shared
component: 20px muted icon, 14px text-primary title, 13px text-muted line, one
optional action), and grep the current admin tree for every hand-rolled empty
state — expect to find variants in at least Notifications, Admin Management,
Activity Log, Barangay Insights, and Work Orders, plus whatever #036/#037/#038
introduced.

Create components/features/admin/shared/EmptyState.tsx matching that spec
exactly, then migrate every existing admin empty state to it in one pass. Do
NOT change the copy or icon choice of any existing empty state unless it is
factually wrong — this is a component consolidation, not a content rewrite.
Do NOT touch any Skeleton/loading-state component — that's a separate rule in
the same design-system section, not this issue's scope.

Do this as one complete sweep rather than a partial migration — do not leave
some pages on the old pattern and others on the new one.

Verify: pnpm build, pnpm lint, then manually trigger an empty state on every
migrated page (a fresh/filtered-to-nothing view for tickets, work orders,
barangays, notifications, admin management, activity log, and reports) and
confirm each renders correctly. Then git diff --check.
```
