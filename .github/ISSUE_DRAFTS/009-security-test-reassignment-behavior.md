# Add security tests for ticket reassignment behavior

**Labels:** `security`, `testing`, `priority:p2`
**Type:** Test coverage
**Priority:** P2

## Background

Ticket reassignment is **not System-Administrator-only**, contrary to what the docs claimed until recently. `TicketsController.reassign` sits behind `AdminSessionGuard` alone, and `TicketsService.reassignOffice` calls:

```ts
assertOfficeAccess(admin, ticket.assigned_office);
```

That is a check against the ticket's **current** office, not against role. `AssignmentPanel.tsx` carries no role gate either.

So an **MEO admin can hand a ticket to MDRRMO** — useful when a "pothole" turns out to be a drainage failure. It is a **one-way move**: afterwards the ticket belongs to MDRRMO and MEO can no longer open it.

This is defensible design (you can only reassign a ticket you already have), and every reassignment is audited. But it is a real capability that was documented as absent, which is exactly the kind of behavior that needs a test pinning it down.

## Problem

`e2e/admin-tickets.spec.ts` tests reassignment **only as a System Administrator**. Nothing asserts:

- that an office admin can reassign at all,
- that they **lose access** afterwards (the one-way property),
- that an office admin cannot reassign a ticket they never had access to,
- that the audit event records the acting admin.

Without these, a future "tighten reassignment to system admin only" change — or the reverse — would pass silently in either direction.

## Proposed scope

Four API-level tests:

1. **MEO admin reassigns their own MEO ticket to MDRRMO** → succeeds.
2. **After that reassignment, the same MEO session gets 403** opening that ticket, and it no longer appears in their list.
3. **MEO admin attempting to reassign an MDRRMO ticket** → 403 (they never had access).
4. **The reassignment writes an `admin_audit_events` row** naming the acting admin, and an `office_reassignments` row.

## Implementation notes

- Use a **disposable ticket** created for this test — reassignment is a real mutation with no automatic revert. The existing system-admin test restores state in a `finally` block; these do not need to, because the ticket is disposable and test-owned.
- `Pothole` always routes to MEO (`api/src/common/utils/office.ts`), so a fresh report gives you an MEO ticket without setup.
- Verify the 403 with the **MEO session**, and confirm the ticket really moved using a **system-admin** query — an MEO session's own `?office=MDRRMO` request is clamped to MEO and cannot prove the move.
- This test needs one new report. Budget it: `docs/testing.md` §6.

## Files likely involved

- `e2e/admin-tickets.spec.ts`
- `docs/testing.md` §9, `docs/project-status.md` §4.3
- Possibly `docs/user-flows.md` §2.6 if behavior is clarified further

## Acceptance criteria

- [ ] Office admin can reassign a ticket they own.
- [ ] After reassignment, that admin gets 403 on the ticket and it is absent from their list.
- [ ] Office admin cannot reassign a ticket belonging to the other office (403).
- [ ] Audit and `office_reassignments` rows are written with the correct actor.
- [ ] Adds at most one report to the suite's budget.

## Suggested tests

This issue *is* the tests. Run only `e2e/admin-tickets.spec.ts`.

## Out of scope

**Changing the reassignment permission model.** If the team decides office admins *should not* be able to reassign, that is a separate product decision with its own issue — this issue documents and pins the behavior as it exists.

## Risks / notes

Do not "fix" the behavior while writing the tests. Pin it first; change it deliberately later if the team wants to.

## Claude Code handoff prompt

```
Add E2E security tests for PORAC-SDSS ticket reassignment behavior.

Read first: api/src/admin/tickets.controller.ts (reassign route),
api/src/admin/tickets.service.ts (reassignOffice — note it uses
assertOfficeAccess against the ticket's CURRENT office, not a role check),
components/features/admin/tickets/AssignmentPanel.tsx (no role gate),
e2e/admin-tickets.spec.ts, docs/user-flows.md §2.6, docs/testing.md §6.

Reassignment is NOT system-admin-only. An office admin can hand a ticket to the
other office; it is one-way, since they lose access afterwards. Pin that
behavior with four tests:

1. MEO admin reassigns their own MEO ticket to MDRRMO -> succeeds.
2. Afterwards the same MEO session gets 403 on that ticket and it is absent
   from their list.
3. MEO admin attempting to reassign an MDRRMO ticket -> 403.
4. The reassignment writes an admin_audit_events row naming the acting admin,
   plus an office_reassignments row.

Use ONE disposable ticket created by the test (Pothole always routes to MEO).
Confirm the ticket actually moved using a SYSTEM ADMIN query — an MEO session's
own ?office=MDRRMO request is clamped to MEO and cannot prove it.

Budget: this adds one report to the suite; see docs/testing.md §6.

DO NOT change the reassignment permission model in this issue. Pin the existing
behavior. If the team later wants to restrict it, that is a separate decision.

Update docs/testing.md §9 and docs/project-status.md §4.3.

Verify: pnpm exec playwright test e2e/admin-tickets.spec.ts -- --workers=1
Then git diff --check
```
