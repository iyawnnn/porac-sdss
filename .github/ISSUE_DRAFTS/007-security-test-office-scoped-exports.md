# Add security tests for office-scoped CSV exports

**Labels:** `security`, `testing`, `priority:p2`
**Type:** Test coverage
**Priority:** P2

## Background

`ReportsService.ticketsCsv` / `workOrdersCsv` (`api/src/admin/reports.*`) deliberately do **not** reimplement office scoping — they call `TicketsService.parseTicketQuery` / `WorkOrdersService.parseQuery` directly, the same functions the list endpoints use. That is what keeps an export from ever returning more than the equivalent list view.

The work-order export additionally **excludes `notes` at the query level**, not by filtering after selection.

## Problem

Both properties are architectural guarantees with **no direct test**. `e2e/admin-reports.spec.ts` exists, but nothing asserts on the *content* of a CSV downloaded by an office admin. A future refactor that inlines filter parsing into `ReportsService` — a natural-looking cleanup — would silently create a cross-office data leak, and the suite would stay green.

## Proposed scope

Add E2E assertions on actual downloaded CSV content:

1. **MEO admin's ticket CSV contains only MEO rows.** Fetch the export endpoint with an MEO session, parse the CSV, assert every `Assigned Office` value is `MEO`.
2. **A doctored `?office=MDRRMO` on the export from an MEO session still returns only MEO rows** — mirrors the existing clamp assertions on the list endpoints.
3. **Work-order CSV never contains a notes column or any note body.** Create a work order with a sentinel note (same technique `admin-work-orders.spec.ts` already uses for the citizen leak check), export, assert the sentinel is absent from the CSV text.
4. Repeat (1) for an MDRRMO session, so enforcement is proven in both directions.

## Implementation notes

- Use `request.get()` with the session cookie, as the existing office-scoping tests do (`sessionCookieHeader` helper pattern).
- Assert on parsed CSV rows, not a substring match, for the office column. A substring check would pass accidentally.
- The sentinel-note check *can* be a raw text search — the point is that the string appears nowhere.
- **These tests create no reports**, so they cost nothing against the 20/hour rate-limit budget (`docs/testing.md` §6). They can reuse a shared disposable ticket or seeded data.

## Files likely involved

- `e2e/admin-reports.spec.ts`
- `docs/testing.md` §9 (mark the gap closed), `docs/project-status.md` §4.3

## Acceptance criteria

- [ ] MEO ticket CSV contains only MEO rows.
- [ ] MDRRMO ticket CSV contains only MDRRMO rows.
- [ ] Doctored `?office=` on the export does not widen either.
- [ ] Work-order CSV contains no note bodies and no notes column.
- [ ] Tests pass without creating new reports.

## Suggested tests

This issue *is* the tests. Run only `e2e/admin-reports.spec.ts`.

## Out of scope

Changing `ReportsService` itself (it is correct), adding export audit logging (deferred — see #032), and PDF export.

## Risks / notes

Keep these tests asserting on *behavior* (what the CSV contains), not on implementation (which function was called). The value is that they survive a refactor.

## Claude Code handoff prompt

```
Add E2E security tests for office-scoped CSV exports in PORAC-SDSS.

Read first: api/src/admin/reports.service.ts, e2e/admin-reports.spec.ts,
e2e/admin-tickets.spec.ts (for the sessionCookieHeader + doctored-office
pattern), e2e/admin-work-orders.spec.ts (for the sentinel-note technique),
docs/testing.md §6.

Add tests asserting on actual downloaded CSV content:
1. MEO session -> ticket CSV contains only rows with Assigned Office = MEO.
2. MEO session with a doctored ?office=MDRRMO -> still only MEO rows.
3. MDRRMO session -> only MDRRMO rows (prove both directions).
4. Work-order CSV contains no notes column and no note body: create a work
   order with a sentinel string, export, assert the sentinel appears nowhere.

Parse CSV rows for the office assertions — do not use a substring match, which
could pass accidentally. A raw text search is fine for the sentinel check.

These tests must NOT create new reports — reuse a shared disposable ticket or
seeded data. See docs/testing.md §6 for why.

Do not modify ReportsService — it is correct; these tests protect it from a
future refactor that inlines filter parsing.

Update docs/testing.md §9 and docs/project-status.md §4.3.

Verify: pnpm exec playwright test e2e/admin-reports.spec.ts -- --workers=1
Then git diff --check
```
