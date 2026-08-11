# Close remaining gaps in work-order office-scoping tests

**Labels:** `security`, `testing`, `priority:p2`
**Type:** Test coverage
**Priority:** P2 — smaller than it sounds; most of this is already covered

## Background

**Much of this is already tested.** `e2e/admin-work-orders.spec.ts` already asserts:

- MEO cannot read, update, or change status on an MDRRMO work order → **403** on all three
- MDRRMO cannot reach a MEO work order → **403** (both directions proven)
- The list endpoint clamps rather than leaking when `?office=MDRRMO` is requested
- Citizens get **401** on work-order routes
- `assignedAdminId=me` combined with `?office=MDRRMO` still clamps to MEO
- Assignee pickers are office-filtered in both directions
- Internal notes never reach the citizen page (sentinel test)

This issue is only about the **remaining gaps**, not a rewrite.

## Problem

Three paths are not covered:

1. **Work-order *creation* against another office's ticket** is tested for MEO→MDRRMO (403), but **not** MDRRMO→MEO. Enforcement is proven one-way only for the create path.
2. **`assignedAdminId` validation across offices** — `WorkOrdersService.create`/`update` validate that the target admin exists, is active, and belongs to the *work order's* office. No test asserts that assigning an MDRRMO admin to a MEO work order is rejected with 400.
3. **Inactive admin as assignee** — the same validation rejects inactive admins. Untested.

## Proposed scope

Three focused API-level tests added to the existing spec:

1. MDRRMO admin creating a work order on a MEO ticket → 403.
2. Assigning an admin from the *other* office → 400 (not a silent accept).
3. Assigning a deactivated admin → 400.

## Implementation notes

- The spec already has `createWorkOrderAsSystemAdmin`, `sharedMeoTicketId`, and `sharedMdrrmoTicketId` — reuse them. **Do not create new tickets**; the file's `beforeAll` already accounts for 2 of the suite's ~16 reports (`docs/testing.md` §6).
- For the inactive-admin case, the suite already creates and deactivates throwaway admins in `admin-management.spec.ts` — follow that pattern, and rely on `cleanup:e2e-admins` in global setup to remove them.
- Assert the **status code and that no work order was created**, not just the status.

## Files likely involved

- `e2e/admin-work-orders.spec.ts`
- `docs/testing.md` §9, `docs/project-status.md` §4.3

## Acceptance criteria

- [ ] MDRRMO → MEO work-order creation returns 403 (matching the existing MEO → MDRRMO test).
- [ ] Cross-office `assignedAdminId` returns 400 and creates nothing.
- [ ] Inactive `assignedAdminId` returns 400 and creates nothing.
- [ ] No new reports created by these tests.

## Suggested tests

This issue *is* the tests. Run only `e2e/admin-work-orders.spec.ts`.

## Out of scope

Rewriting the existing passing coverage, changing `WorkOrdersService` (the validation is already correct), and anything touching ticket scoping (covered by `admin-tickets.spec.ts`).

## Risks / notes

Resist expanding this into a full re-audit of the spec. It is already one of the best-covered files in the suite — three tests close the gaps.

## Claude Code handoff prompt

```
Close three gaps in PORAC-SDSS work-order office-scoping test coverage.

Read first: e2e/admin-work-orders.spec.ts (most of this area is ALREADY
covered — read it before adding anything), api/src/admin/work-orders.service.ts
(assignedAdminId validation), docs/testing.md §6.

Add exactly three tests to the existing spec:
1. MDRRMO admin creating a work order on a MEO ticket -> 403. (The MEO ->
   MDRRMO direction is already tested; this proves the mirror.)
2. create/update with an assignedAdminId belonging to the OTHER office -> 400,
   and no work order created.
3. create/update with a deactivated admin's id -> 400, and none created.

Reuse the existing sharedMeoTicketId / sharedMdrrmoTicketId /
createWorkOrderAsSystemAdmin helpers. Do NOT create new tickets or reports —
see docs/testing.md §6 for the rate-limit budget.

For the inactive-admin case, follow the throwaway-admin pattern in
e2e/admin-management.spec.ts; global setup's cleanup:e2e-admins removes them.

Do not rewrite existing coverage and do not change WorkOrdersService — the
validation is already correct.

Update docs/testing.md §9 and docs/project-status.md §4.3.

Verify: pnpm exec playwright test e2e/admin-work-orders.spec.ts -- --workers=1
Then git diff --check
```
