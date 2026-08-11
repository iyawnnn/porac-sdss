# [Deferred] CSV export for Barangay Insights

**Labels:** `deferred`, `discussion`, `product`
**Type:** Product idea — **not scheduled**
**Priority:** None — deferred

> **Deferred, not queued.** Listed in `docs/project-status.md` §5, and recorded as out of scope when Barangay Insights shipped. Do not implement.

## Background

Barangay Insights (`/admin/barangay-insights` and `/admin/barangay-insights/[barangayId]`) is a **read-only** operational drill-down across all 29 barangays: ticket counts, most common category, last activity, a 30-day trend, a category breakdown, DEM-derived elevation context, and the 10 most recent tickets.

It shipped deliberately without editing, creating, deleting, or exporting. `e2e/admin-barangay-insights.spec.ts` has a test named *"no editing, export, or CSV controls appear anywhere on Barangay Insights"* that asserts this — **that test will fail if this is implemented**, and would need to be updated deliberately rather than deleted.

CSV export already exists for **tickets** and **work orders** (`/admin/reports`), with office scoping enforced by reusing the list endpoints' own filter parsers.

## The idea

Let an admin export the barangay index — counts per barangay — as CSV, for reporting to LGU leadership or inclusion in a written report.

## Why it is deferred

Plausible and small, but no requirement has been stated. Things to settle first:

- **Index only, or profiles too?** The index is one row per barangay. A profile export means trend data, category breakdown, and recent tickets — a different, more complex shape.
- **Does it duplicate the existing ticket export?** `/admin/reports` already exports tickets filterable by barangay. A barangay CSV would be an *aggregate*, which is genuinely different — but the overlap should be acknowledged, not ignored.
- **Where does the button live?** `/admin/reports` is the established exports home. A second export entry point on Barangay Insights fragments that, and `docs/project-status.md` §6 discourages inventing surfaces.

## What would need to happen first

1. A stated need — someone actually asking for barangay aggregates in a spreadsheet.
2. A decision on index vs. profile scope.
3. A decision on where it lives (probably `/admin/reports`, alongside the existing exports).
4. Promotion from `docs/project-status.md` §5 into §4.

## Implementation notes (if it is ever promoted)

- **Reuse the established pattern.** `ReportsService` calls the list endpoints' own filter parsers rather than re-deriving scope — that is what keeps export authorization identical to list authorization. A barangay export must do the same with `BarangayInsightsService`, not reimplement office scoping.
- Reuse `api/src/common/utils/csv.ts`, the existing hand-rolled RFC 4180 writer. Do not add a CSV dependency.
- **Update `e2e/admin-barangay-insights.spec.ts`'s "no export controls" test deliberately** — do not simply delete it.

## Acceptance criteria

**Not applicable — this is not scheduled work.** There is nothing to accept.

The only "done" state for this issue is a deliberate decision: either it is promoted into `docs/project-status.md` §4 with a stated requirement (at which point a real issue with real acceptance criteria replaces this one), or it is closed as not planned.

## Out of scope

Everything until a need is stated.

## Risks / notes

Small enough that it could be done casually — which is the risk. It would add a second export entry point and invalidate an existing intentional test, both of which deserve a decision rather than a drive-by change.

## Claude Code handoff prompt

```
DO NOT IMPLEMENT. This is deferred in docs/project-status.md §5 and was
explicitly out of scope when Barangay Insights shipped.

If someone asks you to add CSV export to PORAC-SDSS Barangay Insights:

1. Confirm a real need was stated, and that it has been promoted from
   docs/project-status.md §5 into §4. If not, stop.
2. Decide scope: the index (one row per barangay) or profiles too (trend,
   category breakdown, recent tickets — a much more complex shape).
3. Decide where it lives. /admin/reports is the established exports home;
   adding a second entry point on Barangay Insights fragments that.

If implemented, follow the existing pattern exactly:
- Reuse BarangayInsightsService's own scoping — do NOT reimplement office
  scoping in a new export path. This mirrors how ReportsService reuses
  TicketsService.parseTicketQuery / WorkOrdersService.parseQuery, which is what
  guarantees export authorization matches list authorization.
- Reuse api/src/common/utils/csv.ts (the existing hand-rolled RFC 4180 writer).
  Do not add a CSV dependency.
- e2e/admin-barangay-insights.spec.ts has a test asserting "no editing, export,
  or CSV controls appear anywhere on Barangay Insights". It WILL fail. Update
  it deliberately with a comment explaining the scope change — do not delete it.

Read for context: api/src/admin/barangay-insights.service.ts,
api/src/admin/reports.service.ts, docs/features.md §3.6 and §3.9,
docs/project-status.md §3 (Barangay Insights) and §5.
```
