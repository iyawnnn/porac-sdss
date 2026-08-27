# Improve Work Orders workspace hierarchy, urgency visibility, and scanning

**Labels:** `frontend`, `priority:p2`
**Type:** Enhancement (frontend/UX redesign, small optional backend touch)
**Priority:** P2

## Background

`components/features/admin/work-orders/CreateWorkOrderDialog.tsx` and `TicketComboboxSelect.tsx` were already redesigned earlier this cycle (searchable ticket combobox, automatic office derivation from the selected ticket) — **leave both of those files alone**, they're current.

The rest of `WorkOrdersWorkspace.tsx` is pre-redesign relative to the Ticket Queue and Flagged Reports pages: a flat filter row (office/status `Select`s plus toggle buttons), a plain `<Table>` (not the CSS-grid Precision Queue pattern those two pages use), a manual pagination re-implementation, and no KPI tiles despite `WorkOrdersService.getOfficePerformanceCounts` (`api/src/admin/work-orders.service.ts`) already computing Pending / In Progress / Overdue / Completed-this-week counts — today those numbers are dashboard-only.

## Problem

An officer scanning this list to decide what to work on next gets **no urgency signal** for any row — they have to open each linked ticket individually to know if it's High-urgency or Low. The list also reads as a flat wall of equal-weight fields (title, office, admin, status, due date all compete for the same visual attention), and there's no at-a-glance summary of workload composition on the page itself.

## Operational / user value

Officers can prioritize which work order to pick up next without opening every linked ticket. A KPI strip answers "how much is overdue / how much did we finish this week" without navigating away to the Dashboard.

## Scope, in priority order

1. **KPI summary strip** — reuse the shared `KpiCard` from #035 and `WorkOrdersService.getOfficePerformanceCounts` (already computed, currently surfaced only inside the Dashboard's Office Performance Summary). No new computation — this is the same data, shown in a second place.
2. **Stronger information hierarchy** in the row/card layout — visually separate identity (ticket/title), state (status, due date), and assignment (office/admin) instead of one flat row where every field competes equally.
3. **Ticket urgency visible per row** — reuse the ticket's already-computed `priority_score`/`urgency_level`, the same values the Ticket Queue already returns on its own list rows. Check first whether `WorkOrderRow` already carries this through any existing join; if it does not, a small existing-query enhancement (join urgency onto the work-order list query, mirroring how the Ticket Queue's own list already does this) is acceptable. **Do not** build a new endpoint or a new scoring computation for this.
4. **Preserve all existing filters/search/office/overdue/"My Assignments" behavior exactly** — this is a presentation and hierarchy pass, not a filter rewrite.
5. **Responsive states** — bring the mobile card list to the same information hierarchy as the desktop view; today they're separate hand-rolled layouts that should read as one design.
6. **Bulk actions — conditional.** Include selection + bulk status/reassign actions **only if** the existing Ticket Queue/Flagged Reports pattern (loop the existing single-work-order service methods, same per-item audit trail, same `{ok, skipped}` partial-success shape) can be reused cleanly with **no new backend endpoint** and **no material growth** to this issue's scope. If it doesn't fit cleanly in the same PR, cut it and say so explicitly in the PR description rather than shipping a half-built selection UI — it can be its own follow-up issue.

**Explicitly not in scope:** a new bulk endpoint, a new scoring/urgency computation, any change to `CreateWorkOrderDialog.tsx`/`TicketComboboxSelect.tsx` (already current), any change to filter semantics, and any large new backend subsystem — the join in step 3, if needed at all, is the only backend touch this issue should require.

## File ownership

- `components/features/admin/work-orders/WorkOrdersWorkspace.tsx` (major restructure)
- Row-level widgets — `WorkOrderStatusBadge.tsx`, `WorkOrderStatusSelect.tsx`, `WorkOrderAssigneeSelect.tsx`, `WorkOrderDueDateEditor.tsx`, `WorkOrderNotesEditor.tsx` — reused as-is inside the new layout, not rewritten.
- Conditionally, only if the urgency join is genuinely needed: `api/src/admin/work-orders.service.ts` (list query only), `api/src/admin/work-orders.controller.ts` (only if the response shape gains a field — not a new route), `lib/types/admin-work-orders.ts`.

## Files the other developer (Kian) should avoid while this is active

- `components/features/admin/work-orders/**`
- Conditionally, if the urgency join is implemented: `api/src/admin/work-orders.service.ts`, `api/src/admin/work-orders.controller.ts`, `lib/types/admin-work-orders.ts`

## Reuse of existing data/API

`WorkOrdersService.getOfficePerformanceCounts` (exists today, dashboard-only); the Ticket Queue's own precedent for returning urgency on a list row; the existing bulk-loop precedent from `TicketsService`/`ModerationService`'s bulk actions, if bulk is included.

## Backend impact

Optional and small only — at most one join added to the existing work-order list query for urgency fields. No new endpoint, no new table, no new subsystem.

## Dependencies

**#035 must merge first** — this issue imports the shared `KpiCard`.

## Acceptance criteria

- [ ] KPI summary strip present, correctly office-scoped, reuses the shared `KpiCard`.
- [ ] Each row/card clearly separates identity, state, and assignment rather than one flat equal-weight list.
- [ ] Ticket urgency is visible per row without opening the linked ticket.
- [ ] Every existing filter (status, office, overdue, My Assignments, search) behaves identically to before this change.
- [ ] The mobile card view reflects the same hierarchy improvements as the desktop table.
- [ ] If bulk actions are included: they loop existing single-work-order endpoints exactly as Ticket Queue/Flagged do (same audit trail, same partial-success shape). If not included, the PR states why.
- [ ] `notes` still never appears in any citizen-facing surface (regression check, not new work).
- [ ] CSV export (existing) still works unchanged.

## Validation

- `pnpm --prefix api test` (only if `work-orders.service.ts` was touched).
- `pnpm build`, `pnpm lint`.
- `e2e/admin-work-orders.spec.ts` (not the full suite — see `docs/testing.md` §6's rate-limit caveat).
- Manual check at the mobile breakpoint.

## Out of scope

A new bulk endpoint, a citizen-facing rollup of any kind, crew scheduling/attachments/checklists (standing do-not-build items per `docs/project-status.md` §6), any change to `CreateWorkOrderDialog.tsx`/`TicketComboboxSelect.tsx`.

## Claude Code handoff prompt

```
Redesign the PORAC-SDSS Work Orders workspace's information hierarchy and
scanning. This is issue #037 — depends on #035 (shared KpiCard) being merged
first.

Read first: components/features/admin/work-orders/WorkOrdersWorkspace.tsx (the
file to change), WorkOrderStatusBadge.tsx, WorkOrderStatusSelect.tsx,
WorkOrderAssigneeSelect.tsx, WorkOrderDueDateEditor.tsx,
WorkOrderNotesEditor.tsx (reuse these as-is), api/src/admin/work-orders.service.ts
(getOfficePerformanceCounts, and the list query if you need the urgency join),
components/features/admin/shared/KpiCard.tsx (from #035 — must exist before you
start), components/features/admin/tickets/queue/QueueRow.tsx and
QueueTable.tsx (the Ticket Queue's existing precision-queue pattern, for
reference on hierarchy/bulk shape — do not copy it wholesale, Work Orders has
its own row shape per docs/project-status.md).

DO NOT touch components/features/admin/work-orders/CreateWorkOrderDialog.tsx
or TicketComboboxSelect.tsx — both were already redesigned this cycle and are
current.

Scope, in priority order:
1. Add a KPI summary strip using the shared KpiCard (#035) and
   WorkOrdersService.getOfficePerformanceCounts (already computed server-side,
   currently only surfaced on the Dashboard). No new computation.
2. Restructure each row/card so identity (ticket/title), state (status, due
   date), and assignment (office/admin) are visually distinct tiers, not one
   flat row.
3. Show the linked ticket's urgency (priority_score/urgency_level) on each
   row. First check whether the current list query already joins this in. If
   not, add ONE join to the existing work-order list query in
   work-orders.service.ts (mirror how the ticket list already returns
   urgency) — do not add a new endpoint or a new scoring formula.
4. Do not change any existing filter's behavior (status/office/overdue/My
   Assignments/search) — this is a presentation pass over the same filtered
   data.
5. Bring the mobile card list to the same hierarchy as the desktop view.
6. ONLY if it fits cleanly with no new backend endpoint and no material scope
   growth: add row selection + bulk status/reassign actions, looping the
   existing single-work-order service methods exactly as the Ticket Queue's
   and Flagged Reports' bulk actions already do (same per-item audit trail,
   same {ok, skipped} partial-success shape). If it does not fit cleanly, skip
   it and say so explicitly in your summary — do not ship a half-built
   selection UI.

Do NOT: add a new bulk endpoint, add a new scoring computation, build any new
backend subsystem, touch CreateWorkOrderDialog/TicketComboboxSelect, or change
CSV export behavior.

Verify: pnpm --prefix api test (only if work-orders.service.ts changed), pnpm
build, pnpm lint, then
pnpm exec playwright test e2e/admin-work-orders.spec.ts -- --workers=1
Check the mobile breakpoint manually. Then git diff --check.
```
